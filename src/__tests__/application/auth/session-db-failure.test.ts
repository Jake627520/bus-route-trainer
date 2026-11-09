import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/infrastructure/db/prisma';
import { signSession } from '@/infrastructure/auth/session-token';
import { SESSION_COOKIE, getAuthSecret } from '@/infrastructure/auth/session-cookie';
import { proxy } from '@/proxy';
import { GET as me } from '@/app/api/auth/me/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as accuracy } from '@/app/api/review/accuracy/route';
import { GET as getRecallSession } from '@/app/api/recall/sessions/[id]/route';

/**
 * 資安稽核 2026-11 追修：每次請求都查 DB 比對 sessionVersion。
 * DB 暫時失敗時要 fail closed：頁面當成未登入，API 回 503，且不外洩例外細節。
 */
const DB_ERROR_DETAIL = 'connect ECONNREFUSED 10.0.0.5:5432 secret-host';

const token = signSession({ driverId: 'drv-db-fail' }, getAuthSecret(), 3600_000);
const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
const pageReq = (path: string, withCookie = true) =>
  new NextRequest(new URL(`http://localhost${path}`), { headers: withCookie ? { cookie } : {} });
const apiReq = (path: string, method = 'GET') => new Request(`http://localhost${path}`, { method, headers: { cookie } });

describe('session lookup when the DB fails', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(prisma.driver, 'findUnique').mockRejectedValue(new Error(DB_ERROR_DETAIL));
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('proxy redirects a protected page to /login instead of throwing (fail closed)', async () => {
    const res = await proxy(pageReq('/practice/recall'));
    expect(res.status).not.toBe(500);
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });

  it('proxy still serves public pages', async () => {
    for (const path of ['/login', '/forgot', '/reset']) {
      const res = await proxy(pageReq(path));
      expect(res.headers.get('location'), path).toBeNull();
    }
  });

  it('proxy logs the failure without printing the cookie or token', async () => {
    await proxy(pageReq('/'));
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(encodeURIComponent(token));
  });

  it('API routes that read the session answer 503 without leaking the error', async () => {
    for (const res of [await me(apiReq('/api/auth/me')), await accuracy(apiReq('/api/review/accuracy'))]) {
      expect(res.status).toBe(503);
      const body = JSON.stringify(await res.json());
      expect(body).toContain('SERVICE_UNAVAILABLE');
      expect(body).not.toContain('ECONNREFUSED');
      expect(body).not.toContain('secret-host');
    }
  });

  it('resolveAuthenticatedDriver routes answer 503 and never fall back to another identity', async () => {
    const res = await getRecallSession(apiReq('/api/recall/sessions/s-1'), { params: Promise.resolve({ id: 's-1' }) });
    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('ECONNREFUSED');
  });

  it('logout still clears the cookie but reports 503 because revocation did not happen', async () => {
    const res = await logout(apiReq('/api/auth/logout', 'POST'));
    expect(res.status).toBe(503);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
