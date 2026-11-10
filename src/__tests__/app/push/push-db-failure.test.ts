import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/infrastructure/db/prisma';
import { signSession } from '@/infrastructure/auth/session-token';
import { SESSION_COOKIE, getAuthSecret } from '@/infrastructure/auth/session-cookie';
import { POST as subscribe } from '@/app/api/push/subscribe/route';
import { POST as unsubscribe } from '@/app/api/push/unsubscribe/route';

/**
 * Change 52 補強：與 #52 一致——查 session 時資料庫失敗，要回 503（不是 500），
 * 不外洩例外細節，也不能當成已登入。
 */
const DB_ERROR_DETAIL = 'connect ECONNREFUSED 10.0.0.5:5432 secret-host';
const cookie = `${SESSION_COOKIE}=${encodeURIComponent(signSession({ driverId: 'drv-db-fail' }, getAuthSecret(), 3600_000))}`;
const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

describe('push routes when the session lookup fails', () => {
  beforeEach(() => {
    vi.spyOn(prisma.driver, 'findUnique').mockRejectedValue(new Error(DB_ERROR_DETAIL));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['subscribe', () => subscribe(post('/api/push/subscribe', { endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } }))],
    ['unsubscribe', () => unsubscribe(post('/api/push/unsubscribe', { endpoint: 'https://push.example/x' }))],
  ])('%s answers 503 SERVICE_UNAVAILABLE without leaking the error', async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).toContain('SERVICE_UNAVAILABLE');
    expect(body).not.toContain('ECONNREFUSED');
    expect(body).not.toContain('secret-host');
  });
});
