import { describe, it, expect, afterEach } from 'vitest';
import { getAuthSecret } from '@/infrastructure/auth/session-cookie';

/**
 * Change 27 Task 1: AUTH_SECRET 生產守衛。
 * prod 未設 / 等於 dev 後備 → throw；prod 有設 → 回值；非 prod → dev 後備。
 */
const DEV_FALLBACK = 'dev-insecure-secret-change-me';

describe('Change 27: getAuthSecret production guard', () => {
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.AUTH_SECRET;

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
    if (origSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = origSecret;
  });

  const setEnv = (nodeEnv: string, secret?: string) => {
    (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
    if (secret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = secret;
  };

  it('throws in production when AUTH_SECRET is unset', () => {
    setEnv('production', undefined);
    expect(() => getAuthSecret()).toThrow(/AUTH_SECRET/);
  });

  it('throws in production when AUTH_SECRET equals the insecure dev fallback', () => {
    setEnv('production', DEV_FALLBACK);
    expect(() => getAuthSecret()).toThrow(/AUTH_SECRET/);
  });

  it('returns the configured secret in production', () => {
    setEnv('production', 'a-real-strong-secret');
    expect(getAuthSecret()).toBe('a-real-strong-secret');
  });

  it('falls back to the dev secret outside production', () => {
    setEnv('development', undefined);
    expect(getAuthSecret()).toBe(DEV_FALLBACK);
    setEnv('test', undefined);
    expect(getAuthSecret()).toBe(DEV_FALLBACK);
  });
});
