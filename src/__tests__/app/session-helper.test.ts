import { describe, it, expect } from 'vitest';
import { resolveDriverId, readSessionDriverId, sessionSetCookie, sessionClearCookie, SESSION_COOKIE, getAuthSecret } from '@/app/_lib/session';
import { signSession } from '@/infrastructure/auth/session-token';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

/**
 * Change 25 Task 8: resolveDriverId + cookie helpers。
 */
const reqWithCookie = (cookie?: string) =>
  new Request('http://localhost/api/x', cookie ? { headers: { cookie } } : undefined);

describe('Change 25: session helper', () => {
  it('resolves driverId from a valid session cookie', () => {
    const token = signSession({ driverId: 'drv-9' }, getAuthSecret(), 3600_000);
    const req = reqWithCookie(`${SESSION_COOKIE}=${encodeURIComponent(token)}`);
    expect(resolveDriverId(req)).toBe('drv-9');
  });

  it('falls back to DEFAULT_DRIVER_ID when no cookie / invalid token', () => {
    expect(resolveDriverId(reqWithCookie())).toBe(DEFAULT_DRIVER_ID);
    expect(resolveDriverId(reqWithCookie(`${SESSION_COOKIE}=garbage`))).toBe(DEFAULT_DRIVER_ID);
  });

  it('coexists with other cookies', () => {
    const token = signSession({ driverId: 'drv-2' }, getAuthSecret(), 3600_000);
    const req = reqWithCookie(`theme=dark; ${SESSION_COOKIE}=${encodeURIComponent(token)}; x=1`);
    expect(resolveDriverId(req)).toBe('drv-2');
  });

  it('readSessionDriverId returns driverId for valid session, null otherwise (Change 26)', () => {
    const token = signSession({ driverId: 'drv-7' }, getAuthSecret(), 3600_000);
    expect(readSessionDriverId(reqWithCookie(`${SESSION_COOKIE}=${encodeURIComponent(token)}`))).toBe('drv-7');
    // 無 cookie / 亂碼 / 過期 → null（與 resolveDriverId 的 DEFAULT 後備區隔）
    expect(readSessionDriverId(reqWithCookie())).toBeNull();
    expect(readSessionDriverId(reqWithCookie(`${SESSION_COOKIE}=garbage`))).toBeNull();
    const expired = signSession({ driverId: 'drv-x' }, getAuthSecret(), -1000);
    expect(readSessionDriverId(reqWithCookie(`${SESSION_COOKIE}=${encodeURIComponent(expired)}`))).toBeNull();
  });

  it('builds httpOnly set/clear cookies', () => {
    const set = sessionSetCookie('drv-1');
    expect(set).toContain(`${SESSION_COOKIE}=`);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Max-Age=\d+/);
    expect(sessionClearCookie()).toMatch(/Max-Age=0/);
  });
});
