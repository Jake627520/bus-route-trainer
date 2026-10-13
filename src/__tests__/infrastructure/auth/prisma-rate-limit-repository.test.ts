import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaRateLimitRepository } from '@/infrastructure/auth/prisma-rate-limit-repository';

/** Change 49: 需要真的 Postgres（原子遞增、清除、過期清理）。 */
describe('Change 49: PrismaRateLimitRepository (integration)', () => {
  const prisma = new PrismaClient();
  const repo = new PrismaRateLimitRepository(prisma);
  const W1 = new Date('2026-10-13T00:00:00.000Z');
  const W2 = new Date('2026-10-13T00:15:00.000Z');

  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await prisma.authRateLimit.deleteMany(); });

  it('starts at 0 and increments by one', async () => {
    expect(await repo.count('k', W1)).toBe(0);
    expect(await repo.increment('k', W1)).toBe(1);
    expect(await repo.increment('k', W1)).toBe(2);
    expect(await repo.count('k', W1)).toBe(2);
  });

  it('keeps separate counts per key and per window', async () => {
    await repo.increment('a', W1);
    await repo.increment('a', W1);
    await repo.increment('b', W1);
    await repo.increment('a', W2);
    expect(await repo.count('a', W1)).toBe(2);
    expect(await repo.count('b', W1)).toBe(1);
    expect(await repo.count('a', W2)).toBe(1);
  });

  it('never loses a count under concurrent increments (atomic)', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => repo.increment('race', W1)));
    expect(await repo.count('race', W1)).toBe(25);
    // each caller saw a distinct value 1..25
    expect(new Set(results).size).toBe(25);
    expect(Math.max(...results)).toBe(25);
  });

  it('clear() removes every window of one key and leaves others alone', async () => {
    await repo.increment('a', W1);
    await repo.increment('a', W2);
    await repo.increment('b', W1);
    await repo.clear('a');
    expect(await repo.count('a', W1)).toBe(0);
    expect(await repo.count('a', W2)).toBe(0);
    expect(await repo.count('b', W1)).toBe(1);
  });

  it('deleteOlderThan() removes only windows before the cutoff', async () => {
    await repo.increment('a', W1);
    await repo.increment('a', W2);
    await repo.deleteOlderThan(W2);
    expect(await repo.count('a', W1)).toBe(0);
    expect(await repo.count('a', W2)).toBe(1);
  });
});
