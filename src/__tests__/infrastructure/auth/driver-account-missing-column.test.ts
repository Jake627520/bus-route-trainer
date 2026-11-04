import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';

const account = {
  id: 'drv-1',
  username: 'ada',
  email: null,
  passwordHash: 'hash',
  passwordSalt: 'salt',
};

function missingColumn() {
  return new Prisma.PrismaClientKnownRequestError(
    'The column `session_version` does not exist in the current database.',
    { code: 'P2022', clientVersion: 'test', meta: { column: 'session_version' } },
  );
}

describe('driver account queries before session_version exists', () => {
  it('loads an account without selecting sessionVersion', async () => {
    const findUnique = vi.fn().mockResolvedValue(account);
    const repo = new PrismaDriverAccountRepository({ driver: { findUnique } } as unknown as PrismaClient);
    await expect(repo.findByUsername('ada')).resolves.toMatchObject({ id: 'drv-1', username: 'ada' });
    expect(findUnique.mock.calls[0][0].select.sessionVersion).toBeUndefined();
    expect(findUnique.mock.calls[0][0].select).toMatchObject({ id: true, username: true });
  });

  it('updates the password without sessionVersion when the column is missing', async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(missingColumn())
      .mockResolvedValueOnce({ id: 'drv-1' });
    const repo = new PrismaDriverAccountRepository({ driver: { update } } as unknown as PrismaClient);
    await repo.updatePassword('drv-1', 'new-hash', 'new-salt');
    expect(update.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
    expect(update.mock.calls[1][0].data.sessionVersion).toBeUndefined();
    expect(update.mock.calls[1][0].select).toEqual({ id: true });
  });
});
