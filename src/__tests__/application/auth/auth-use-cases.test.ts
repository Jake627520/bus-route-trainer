import { describe, it, expect, vi } from 'vitest';
import { RegisterDriverUseCase, UsernameTakenError, EmailTakenError } from '@/application/auth/register-driver-use-case';
import { AuthenticateDriverUseCase } from '@/application/auth/authenticate-driver-use-case';
import { RequestPasswordResetUseCase } from '@/application/auth/request-password-reset-use-case';
import { ResetPasswordUseCase, InvalidResetTokenError } from '@/application/auth/reset-password-use-case';
import type { EmailSender } from '@/application/auth/email-sender.port';
import type {
  DriverAccount,
  DriverAccountRepository,
  CreateDriverAccountInput,
  ResetTokenRecord,
} from '@/application/auth/driver-account-repository.port';

/**
 * Change 25 Task 5 / 41: Register / Authenticate use-case（fake repo + fake hash/verify）。
 */
function fakeRepo(seed: DriverAccount[] = []): DriverAccountRepository {
  const rows = [...seed];
  const tokens: ResetTokenRecord[] = [];
  return {
    findByUsername: async (u) => rows.find((r) => r.username === u) ?? null,
    findByEmail: async (e) => rows.find((r) => r.email === e) ?? null,
    findById: async (id) => rows.find((r) => r.id === id) ?? null,
    create: async (input: CreateDriverAccountInput) => {
      const acc: DriverAccount = {
        id: `id-${rows.length + 1}`,
        username: input.username,
        email: input.email ?? null,
        passwordHash: input.passwordHash,
        passwordSalt: input.passwordSalt,
      };
      rows.push(acc);
      return acc;
    },
    updatePassword: async (driverId, passwordHash, passwordSalt) => {
      const r = rows.find((x) => x.id === driverId);
      if (r) {
        r.passwordHash = passwordHash;
        r.passwordSalt = passwordSalt;
      }
    },
    createResetToken: async (driverId, tokenHash, expiresAt) => {
      tokens.push({ id: `tok-${tokens.length + 1}`, driverId, tokenHash, expiresAt, usedAt: null });
    },
    findResetToken: async (tokenHash) => tokens.find((t) => t.tokenHash === tokenHash) ?? null,
    markResetTokenUsed: async (id) => {
      const t = tokens.find((x) => x.id === id);
      if (t) t.usedAt = new Date();
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
    const repo = fakeRepo([{ id: 'x', username: 'bob', email: null, passwordHash: 'H(pw)', passwordSalt: 'S' }]);
    const uc = new RegisterDriverUseCase(repo, hash);
    await expect(uc.execute({ username: 'bob', password: 'pw' })).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it('authenticates with correct password, rejects wrong / unknown', async () => {
    const repo = fakeRepo([{ id: 'u1', username: 'carol', email: null, passwordHash: 'H(secret)', passwordSalt: 'S' }]);
    const uc = new AuthenticateDriverUseCase(repo, verify);
    expect(await uc.execute({ username: 'carol', password: 'secret' })).toEqual({ id: 'u1', username: 'carol' });
    expect(await uc.execute({ username: 'carol', password: 'nope' })).toBeNull();
    expect(await uc.execute({ username: 'ghost', password: 'x' })).toBeNull();
  });

  // Change 41: 密碼重設
  it('rejects duplicate email at registration', async () => {
    const repo = fakeRepo([{ id: 'x', username: 'bob', email: 'bob@x.com', passwordHash: 'H', passwordSalt: 'S' }]);
    const uc = new RegisterDriverUseCase(repo, hash);
    await expect(uc.execute({ username: 'bob2', password: 'pw', email: 'BOB@x.com' })).rejects.toBeInstanceOf(EmailTakenError);
  });

  const fixedClock = { now: () => new Date('2026-10-08T00:00:00.000Z') };
  const fakeEmail = (): EmailSender & { sent: { to: string; text?: string }[] } => {
    const sent: { to: string; text?: string }[] = [];
    return { sent, send: vi.fn(async (m) => { sent.push({ to: m.to, text: m.text }); }) };
  };
  const tokenFactory = () => ({ token: 'plain-tok', tokenHash: 'hash-tok' });

  it('request reset: sends email + stores token when email exists', async () => {
    const repo = fakeRepo([{ id: 'u1', username: 'dan', email: 'dan@x.com', passwordHash: 'H', passwordSalt: 'S' }]);
    const email = fakeEmail();
    const uc = new RequestPasswordResetUseCase(repo, email, fixedClock, tokenFactory);
    await uc.execute({ email: 'DAN@x.com', resetUrlBase: 'https://app/reset' });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe('dan@x.com');
    expect(email.sent[0].text).toContain('https://app/reset?token=plain-tok');
    expect(await repo.findResetToken('hash-tok')).not.toBeNull();
  });

  it('request reset: no email / no token when address unknown (no enumeration)', async () => {
    const repo = fakeRepo();
    const email = fakeEmail();
    const uc = new RequestPasswordResetUseCase(repo, email, fixedClock, tokenFactory);
    await uc.execute({ email: 'nobody@x.com', resetUrlBase: 'https://app/reset' });
    expect(email.sent).toHaveLength(0);
  });

  it('reset password: valid token updates password and marks used; reused/expired rejected', async () => {
    const repo = fakeRepo([{ id: 'u1', username: 'eve', email: 'eve@x.com', passwordHash: 'OLD', passwordSalt: 'S' }]);
    await repo.createResetToken('u1', 'hash-ok', new Date('2026-10-08T01:00:00.000Z'));
    const uc = new ResetPasswordUseCase(repo, fixedClock);

    await uc.execute({ tokenHash: 'hash-ok', newPasswordHash: 'NEW', newPasswordSalt: 'S2' });
    expect((await repo.findById('u1'))?.passwordHash).toBe('NEW');

    // 再用同一 token → 失敗（已 used）
    await expect(uc.execute({ tokenHash: 'hash-ok', newPasswordHash: 'X', newPasswordSalt: 'S' })).rejects.toBeInstanceOf(InvalidResetTokenError);
    // 未知 token → 失敗
    await expect(uc.execute({ tokenHash: 'nope', newPasswordHash: 'X', newPasswordSalt: 'S' })).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it('reset password: expired token rejected', async () => {
    const repo = fakeRepo([{ id: 'u1', username: 'frank', email: 'f@x.com', passwordHash: 'OLD', passwordSalt: 'S' }]);
    await repo.createResetToken('u1', 'hash-exp', new Date('2026-10-07T00:00:00.000Z')); // 已過期
    const uc = new ResetPasswordUseCase(repo, fixedClock);
    await expect(uc.execute({ tokenHash: 'hash-exp', newPasswordHash: 'X', newPasswordSalt: 'S' })).rejects.toBeInstanceOf(InvalidResetTokenError);
  });
});
