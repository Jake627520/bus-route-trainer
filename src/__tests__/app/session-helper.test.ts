import { describe, it, expect } from 'vitest';
import { resolveDriverId, sessionSetCookie, sessionClearCookie, SESSION_COOKIE, getAuthSecret } from '@/app/_lib/session';
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

  it('builds httpOnly set/clear cookies', () => {
    const set = sessionSetCookie('drv-1');
    expect(set).toContain(`${SESSION_COOKIE}=`);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Max-Age=\d+/);
    expect(sessionClearCookie()).toMatch(/Max-Age=0/);
  });
});
