import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { SESSION_COOKIE } from '@/app/_lib/session';

/**
 * Change 25 Task 6-7: /api/auth/register|login|logout 整合測試（真 DB）。
 */
describe('auth API', () => {
  const prisma = new PrismaClient();
  const cleanup = async () => { await prisma.driver.deleteMany(); };
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  const jreq = (body: unknown) =>
    new Request('http://localhost/api/auth/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('registers a new driver (201) and rejects duplicate (409) / bad input (400)', async () => {
    const ok = await register(jreq({ username: 'alice', password: 'Secret#1a' }));
    expect(ok.status).toBe(201);
    expect((await ok.json()).data).toMatchObject({ username: 'alice' });

    const dup = await register(jreq({ username: 'alice', password: 'Secret#2b' }));
    expect(dup.status).toBe(409);

    const bad = await register(jreq({ username: 'x', password: '1' }));
    expect(bad.status).toBe(400);
  });

  // Change 42: 密碼強度政策
  it('rejects a weak password with WEAK_PASSWORD and the failed rule list', async () => {
    const res = await register(jreq({ username: 'weakuser', password: 'password123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('WEAK_PASSWORD');
    expect(body.error.failedRules).toEqual(expect.arrayContaining(['UPPERCASE', 'SPECIAL']));
  });

  it('logs in with correct credentials (200 + session cookie), rejects wrong (401)', async () => {
    await register(jreq({ username: 'bob', password: 'GoodPass#9' }));

    const good = await login(jreq({ username: 'bob', password: 'GoodPass#9' }));
    expect(good.status).toBe(200);
    expect(good.headers.get('set-cookie') ?? '').toContain(`${SESSION_COOKIE}=`);

    const wrong = await login(jreq({ username: 'bob', password: 'nope' }));
    expect(wrong.status).toBe(401);
  });

  it('logout clears the session cookie', async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toMatch(/Max-Age=0/);
  });
});
