import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as reset } from '@/app/api/auth/reset/route';
import { hashResetToken } from '@/infrastructure/auth/reset-token';

/**
 * Security audit 2026-11: 重設 token 要原子消耗，成功後同一 driver 其他未用 token 一併作廢。
 */
describe('password reset token consumption', () => {
  const prisma = new PrismaClient();
  const cleanup = async () => { await prisma.driver.deleteMany(); };
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  const resetReq = (token: string, password: string) =>
    new Request('http://localhost/api/auth/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });

  async function driverWithTokens(...tokens: string[]): Promise<string> {
    const driver = await prisma.driver.create({
      data: { username: 'dana', email: 'dana@example.com', passwordHash: 'h', passwordSalt: 's' },
    });
    for (const t of tokens) {
      await prisma.passwordResetToken.create({
        data: { driverId: driver.id, tokenHash: hashResetToken(t), expiresAt: new Date(Date.now() + 3600_000) },
      });
    }
    return driver.id;
  }

  it('lets only one of two concurrent requests consume the same token', async () => {
    await driverWithTokens('tok-a');
    const [r1, r2] = await Promise.all([
      reset(resetReq('tok-a', 'FirstPass#1')),
      reset(resetReq('tok-a', 'OtherPass#2')),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 400]);
  });

  it('invalidates the driver\'s other outstanding reset tokens after a successful reset', async () => {
    await driverWithTokens('tok-old', 'tok-new');
    expect((await reset(resetReq('tok-new', 'NewPass#9x'))).status).toBe(200);

    const res = await reset(resetReq('tok-old', 'Hijack#9x'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_TOKEN');
  });
});
