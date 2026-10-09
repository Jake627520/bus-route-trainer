import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/auth/me/route';
import { SESSION_COOKIE } from '@/app/_lib/session';

/**
 * Change 26 Task 6: GET /api/auth/me（真 DB）。
 */
describe('GET /api/auth/me', () => {
  const prisma = new PrismaClient();
  const cleanup = async () => { await prisma.driver.deleteMany(); };
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  const jreq = (body: unknown) =>
    new Request('http://localhost/api/auth/x', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });

  it('returns the logged-in driver for a valid session cookie', async () => {
    await register(jreq({ username: 'alice', password: 'Secret#1a' }));
    const loginRes = await login(jreq({ username: 'alice', password: 'Secret#1a' }));
    const setCookie = loginRes.headers.get('set-cookie') ?? '';
    const cookie = setCookie.split(';')[0]; // brt_session=...

    const res = await me(new Request('http://localhost/api/auth/me', { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ username: 'alice' });
  });

  it('returns 401 when not signed in', async () => {
    const res = await me(new Request('http://localhost/api/auth/me'));
    expect(res.status).toBe(401);
  });

  it('extracts the cookie name correctly', () => {
    expect(SESSION_COOKIE).toBe('brt_session');
  });
});
