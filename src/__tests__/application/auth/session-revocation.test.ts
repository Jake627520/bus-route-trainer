import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { POST as reset } from '@/app/api/auth/reset/route';
import { GET as me } from '@/app/api/auth/me/route';
import { proxy } from '@/proxy';
import { hashResetToken } from '@/infrastructure/auth/reset-token';

/**
 * Security audit 2026-11: session 要能撤銷。
 * 登出、重設密碼後，舊 cookie 立刻失效（Driver.sessionVersion 遞增）。
 */
describe('session revocation', () => {
  const prisma = new PrismaClient();
  const cleanup = async () => { await prisma.driver.deleteMany(); };
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  const jreq = (body: unknown, cookie?: string) =>
    new Request('http://localhost/api/auth/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

  const meWith = (cookie: string) => me(new Request('http://localhost/api/auth/me', { headers: { cookie } }));

  async function signIn(username: string, password = 'GoodPass#9'): Promise<string> {
    await register(jreq({ username, password, email: `${username}@example.com` }));
    const res = await login(jreq({ username, password }));
    return (res.headers.get('set-cookie') ?? '').split(';')[0];
  }

  it('logout invalidates the presented session cookie server-side', async () => {
    const cookie = await signIn('alice');
    expect((await meWith(cookie)).status).toBe(200);

    const out = await logout(jreq({}, cookie));
    expect(out.status).toBe(200);

    expect((await meWith(cookie)).status).toBe(401);
  });

  it('password reset invalidates sessions issued before it', async () => {
    const cookie = await signIn('bob');
    expect((await meWith(cookie)).status).toBe(200);

    const driver = await prisma.driver.findUniqueOrThrow({ where: { username: 'bob' } });
    await prisma.passwordResetToken.create({
      data: { driverId: driver.id, tokenHash: hashResetToken('tok-1'), expiresAt: new Date(Date.now() + 3600_000) },
    });
    const res = await reset(jreq({ token: 'tok-1', password: 'NewPass#9x' }));
    expect(res.status).toBe(200);

    expect((await meWith(cookie)).status).toBe(401);

    // 用新密碼重新登入可取得有效 session
    const fresh = await login(jreq({ username: 'bob', password: 'NewPass#9x' }));
    const freshCookie = (fresh.headers.get('set-cookie') ?? '').split(';')[0];
    expect((await meWith(freshCookie)).status).toBe(200);
  });

  it('proxy treats a revoked cookie as signed out', async () => {
    const cookie = await signIn('carol');
    await logout(jreq({}, cookie));
    const res = await proxy(new NextRequest(new URL('http://localhost/'), { headers: { cookie } }));
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });
});
