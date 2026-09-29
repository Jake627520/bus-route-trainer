import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/infrastructure/auth/password-hasher';

/**
 * Change 25 Task 1: 密碼雜湊（scrypt + salt + timingSafeEqual）。
 */
describe('Change 25: password hasher', () => {
  it('hashes and verifies the correct password', async () => {
    const { hash, salt } = await hashPassword('s3cret-pw');
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(await verifyPassword('s3cret-pw', hash, salt)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const { hash, salt } = await hashPassword('s3cret-pw');
    expect(await verifyPassword('wrong', hash, salt)).toBe(false);
  });

  it('uses a random salt (different hashes for same password)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});
