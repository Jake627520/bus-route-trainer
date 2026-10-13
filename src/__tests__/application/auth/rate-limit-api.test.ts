import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as forgot } from '@/app/api/auth/forgot/route';
import { POST as reset } from '@/app/api/auth/reset/route';

/**
 * Change 49 Task 6-8: 認證端點限流（真 DB）。
 * vitest.setup.ts 預設關閉限流（RATE_LIMIT_DISABLED=1），這裡明確打開。
 */
describe('Change 49: auth endpoints are rate limited', () => {
  const prisma = new PrismaClient();
  const GOOD = 'GoodPass#9';

  const post = (body: unknown, ip: string | null) =>
    new Request('http://localhost/api/auth/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
      body: JSON.stringify(body),
    });

  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => {
    await prisma.authRateLimit.deleteMany();
    await prisma.driver.deleteMany();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    vi.stubEnv('RATE_LIMIT_DISABLED', '');
    await prisma.authRateLimit.deleteMany();
    await prisma.driver.deleteMany();
  });
  afterEach(() => vi.unstubAllEnvs());

  describe('login', () => {
    it('blocks the 31st attempt from one IP with 429 + Retry-After', async () => {
      for (let i = 1; i <= 30; i++) {
        const r = await login(post({ username: `nobody${i}`, password: 'x' }, '198.51.100.1'));
        expect(r.status).toBe(401);
      }
      const blocked = await login(post({ username: 'nobody31', password: 'x' }, '198.51.100.1'));
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
      const body = await blocked.json();
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('locks one username after 5 failures — even a correct password is refused', async () => {
      await register(post({ username: 'bob', password: GOOD }, '198.51.100.2'));
      for (let i = 0; i < 5; i++) {
        expect((await login(post({ username: 'bob', password: 'wrong' }, '198.51.100.3'))).status).toBe(401);
      }
      const locked = await login(post({ username: 'bob', password: GOOD }, '198.51.100.3'));
      expect(locked.status).toBe(429);
      expect((await locked.json()).error.code).toBe('RATE_LIMITED');
    });

    it('the lock follows the username, not the IP', async () => {
      await register(post({ username: 'carol', password: GOOD }, '198.51.100.2'));
      for (let i = 0; i < 5; i++) await login(post({ username: 'carol', password: 'wrong' }, '198.51.100.4'));
      const fromElsewhere = await login(post({ username: 'carol', password: GOOD }, '198.51.100.5'));
      expect(fromElsewhere.status).toBe(429);
    });

    it('a successful login clears the failure count', async () => {
      await register(post({ username: 'dave', password: GOOD }, '198.51.100.2'));
      for (let i = 0; i < 4; i++) await login(post({ username: 'dave', password: 'wrong' }, '198.51.100.6'));
      expect((await login(post({ username: 'dave', password: GOOD }, '198.51.100.6'))).status).toBe(200);
      for (let i = 0; i < 4; i++) {
        expect((await login(post({ username: 'dave', password: 'wrong' }, '198.51.100.6'))).status).toBe(401);
      }
    });

    it('other IPs are unaffected by one IP being blocked', async () => {
      for (let i = 0; i < 31; i++) await login(post({ username: `n${i}`, password: 'x' }, '198.51.100.7'));
      expect((await login(post({ username: 'z', password: 'x' }, '198.51.100.8'))).status).toBe(401);
    });

    it('requests with no IP header share one conservative "unknown" bucket', async () => {
      for (let i = 0; i < 30; i++) await login(post({ username: `n${i}`, password: 'x' }, null));
      expect((await login(post({ username: 'z', password: 'x' }, null))).status).toBe(429);
    });

    it('does nothing when RATE_LIMIT_DISABLED=1 (test/ops escape hatch)', async () => {
      vi.stubEnv('RATE_LIMIT_DISABLED', '1');
      for (let i = 0; i < 40; i++) {
        expect((await login(post({ username: `n${i}`, password: 'x' }, '198.51.100.9'))).status).toBe(401);
      }
    });
  });

  describe('register', () => {
    it('blocks the 11th registration from one IP', async () => {
      for (let i = 1; i <= 10; i++) {
        expect((await register(post({ username: `user${i}`, password: GOOD }, '198.51.100.10'))).status).toBe(201);
      }
      const blocked = await register(post({ username: 'user11', password: GOOD }, '198.51.100.10'));
      expect(blocked.status).toBe(429);
      expect((await blocked.json()).error.code).toBe('RATE_LIMITED');
      expect(await prisma.driver.count()).toBe(10);
    });
  });

  describe('reset', () => {
    it('blocks the 21st token guess from one IP', async () => {
      for (let i = 1; i <= 20; i++) {
        expect((await reset(post({ token: `guess${i}`, password: GOOD }, '198.51.100.11'))).status).toBe(400);
      }
      expect((await reset(post({ token: 'guess21', password: GOOD }, '198.51.100.11'))).status).toBe(429);
    });
  });

  describe('forgot', () => {
    it('blocks the 11th request from one IP with 429', async () => {
      for (let i = 1; i <= 10; i++) {
        expect((await forgot(post({ email: `nobody${i}@example.com` }, '198.51.100.12'))).status).toBe(200);
      }
      expect((await forgot(post({ email: 'nobody11@example.com' }, '198.51.100.12'))).status).toBe(429);
    });

    it('a 4th request for the same email still answers 200 but sends nothing (no existence leak)', async () => {
      await register(post({ username: 'erin', password: GOOD, email: 'erin@example.com' }, '198.51.100.2'));
      const tokens = () => prisma.passwordResetToken.count();
      for (let i = 0; i < 3; i++) {
        expect((await forgot(post({ email: 'erin@example.com' }, `198.51.100.${20 + i}`))).status).toBe(200);
      }
      expect(await tokens()).toBe(3);
      const fourth = await forgot(post({ email: 'Erin@Example.com ' }, '198.51.100.30'));
      expect(fourth.status).toBe(200);
      expect(await fourth.json()).toEqual({ data: { ok: true } });
      expect(await tokens()).toBe(3); // no new reset token → no email
    });

    it('unknown and known emails get the same answer when over the email limit', async () => {
      for (let i = 0; i < 4; i++) await forgot(post({ email: 'ghost@example.com' }, `198.51.100.${40 + i}`));
      const res = await forgot(post({ email: 'ghost@example.com' }, '198.51.100.50'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { ok: true } });
    });
  });
});
