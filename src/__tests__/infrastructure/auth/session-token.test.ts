import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '@/infrastructure/auth/session-token';

/**
 * Change 25 Task 2: session token（HMAC 簽章 + 過期）。
 */
describe('Change 25: session token', () => {
  const secret = 'test-secret';

  it('signs and verifies a token, recovering driverId', () => {
    const token = signSession({ driverId: 'drv-1' }, secret, 3600_000);
    expect(verifySession(token, secret)).toMatchObject({ driverId: 'drv-1' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSession({ driverId: 'drv-1' }, secret, 3600_000);
    expect(verifySession(token, 'other-secret')).toBeNull();
  });

  it('rejects a tampered token', () => {
    const token = signSession({ driverId: 'drv-1' }, secret, 3600_000);
    const [payload] = token.split('.');
    expect(verifySession(`${payload}.deadbeef`, secret)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signSession({ driverId: 'drv-1' }, secret, -1000); // 已過期
    expect(verifySession(token, secret)).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(verifySession('', secret)).toBeNull();
    expect(verifySession('no-dot', secret)).toBeNull();
  });
});
