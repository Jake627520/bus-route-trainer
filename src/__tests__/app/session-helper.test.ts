import { describe, it, expect } from 'vitest';
import { requireDriverId, UnauthenticatedError, readSessionDriverId, sessionSetCookie, sessionClearCookie, SESSION_COOKIE, getAuthSecret } from '@/app/_lib/session';
import { signSession } from '@/infrastructure/auth/session-token';

/**
 * Change 25/29: session helper（requireDriverId 強制認證 + cookie helpers）。
 */
const reqWithCookie = (cookie?: string) =>
  new Request('http://localhost/api/x', cookie ? { headers: { cookie } } : undefined);

describe('Change 25/29: session helper', () => {
  it('requireDriverId returns driverId from a valid session cookie', () => {
    const token = signSession({ driverId: 'drv-9' }, getAuthSecret(), 3600_000);
    const req = reqWithCookie(`${SESSION_COOKIE}=${encodeURIComponent(token)}`);
    expect(requireDriverId(req)).toBe('drv-9');
  });

  it('requireDriverId throws UnauthenticatedError when no/invalid cookie (Change 29: no DEFAULT fallback)', () => {
    expect(() => requireDriverId(reqWithCookie())).toThrow(UnauthenticatedError);
    expect(() => requireDriverId(reqWithCookie(`${SESSION_COOKIE}=garbage`))).toThrow(UnauthenticatedError);
  });

  it('requireDriverId coexists with other cookies', () => {
    const token = signSession({ driverId: 'drv-2' }, getAuthSecret(), 3600_000);
    const req = reqWithCookie(`theme=dark; ${SESSION_COOKIE}=${encodeURIComponent(token)}; x=1`);
    expect(requireDriverId(req)).toBe('drv-2');
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
