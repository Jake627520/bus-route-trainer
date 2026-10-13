import { describe, it, expect } from 'vitest';
import { RATE_RULES } from '@/domain/auth/rate-limit-policy';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Change 49: 次數與時間窗是人審核准的數字，改動需同步提案／規格。 */
describe('Change 49: rate limit policy', () => {
  it('matches the approved numbers', () => {
    expect(RATE_RULES.loginIp).toMatchObject({ limit: 30, windowMs: 15 * MIN });
    expect(RATE_RULES.loginFailUser).toMatchObject({ limit: 5, windowMs: 15 * MIN });
    expect(RATE_RULES.registerIp).toMatchObject({ limit: 10, windowMs: HOUR });
    expect(RATE_RULES.forgotIp).toMatchObject({ limit: 10, windowMs: HOUR });
    expect(RATE_RULES.forgotEmail).toMatchObject({ limit: 3, windowMs: HOUR });
    expect(RATE_RULES.resetIp).toMatchObject({ limit: 20, windowMs: HOUR });
  });

  it('gives every rule a unique name (it is part of the storage key)', () => {
    const names = Object.values(RATE_RULES).map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
