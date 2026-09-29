import { describe, it, expect } from 'vitest';
import { RegisterDriverUseCase, UsernameTakenError } from '@/application/auth/register-driver-use-case';
import { AuthenticateDriverUseCase } from '@/application/auth/authenticate-driver-use-case';
import type { DriverAccount, DriverAccountRepository, CreateDriverAccountInput } from '@/application/auth/driver-account-repository.port';

/**
 * Change 25 Task 5: Register / Authenticate use-case（fake repo + fake hash/verify）。
 */
function fakeRepo(seed: DriverAccount[] = []): DriverAccountRepository {
  const rows = [...seed];
  return {
    findByUsername: async (u) => rows.find((r) => r.username === u) ?? null,
    create: async (input: CreateDriverAccountInput) => {
      const acc: DriverAccount = { id: `id-${rows.length + 1}`, ...input };
      rows.push(acc);
      return acc;
    },
  };
}

describe('Change 25: auth use-cases', () => {
  const hash = async (pw: string) => ({ hash: `H(${pw})`, salt: 'S' });
  const verify = async (pw: string, h: string) => h === `H(${pw})`;

  it('registers a new driver (hashed) and returns id + username', async () => {
    const repo = fakeRepo();
    const uc = new RegisterDriverUseCase(repo, hash);
    const result = await uc.execute({ username: 'alice', password: 'pw' });
    expect(result).toMatchObject({ username: 'alice' });
    expect(result.id).toBeTruthy();
    expect((await repo.findByUsername('alice'))?.passwordHash).toBe('H(pw)');
  });

  it('rejects duplicate username with UsernameTakenError', async () => {
    const repo = fakeRepo([{ id: 'x', username: 'bob', passwordHash: 'H(pw)', passwordSalt: 'S' }]);
    const uc = new RegisterDriverUseCase(repo, hash);
    await expect(uc.execute({ username: 'bob', password: 'pw' })).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it('authenticates with correct password, rejects wrong / unknown', async () => {
    const repo = fakeRepo([{ id: 'u1', username: 'carol', passwordHash: 'H(secret)', passwordSalt: 'S' }]);
    const uc = new AuthenticateDriverUseCase(repo, verify);
    expect(await uc.execute({ username: 'carol', password: 'secret' })).toEqual({ id: 'u1', username: 'carol' });
    expect(await uc.execute({ username: 'carol', password: 'nope' })).toBeNull();
    expect(await uc.execute({ username: 'ghost', password: 'x' })).toBeNull();
  });
});
