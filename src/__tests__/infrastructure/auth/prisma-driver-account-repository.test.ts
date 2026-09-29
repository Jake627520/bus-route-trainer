import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';

/**
 * Change 25 Task 4: DriverAccountRepository 整合測試（真 DB）。
 */
describe('PrismaDriverAccountRepository', () => {
  const prisma = new PrismaClient();
  const repo = new PrismaDriverAccountRepository(prisma);
  const cleanup = async () => { await prisma.driver.deleteMany(); };
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  it('creates and finds a driver account by username', async () => {
    const created = await repo.create({ username: 'alice', passwordHash: 'h', passwordSalt: 's' });
    expect(created.id).toBeTruthy();
    const found = await repo.findByUsername('alice');
    expect(found).toMatchObject({ username: 'alice', passwordHash: 'h', passwordSalt: 's' });
  });

  it('returns null for an unknown username', async () => {
    expect(await repo.findByUsername('nobody')).toBeNull();
  });

  it('enforces unique username', async () => {
    await repo.create({ username: 'dup', passwordHash: 'h', passwordSalt: 's' });
    await expect(repo.create({ username: 'dup', passwordHash: 'h2', passwordSalt: 's2' })).rejects.toThrow();
  });
});
