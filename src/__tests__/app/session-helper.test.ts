import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { requireDriverId, UnauthenticatedError, readSessionDriverId, sessionSetCookie, sessionClearCookie, SESSION_COOKIE, getAuthSecret } from '@/app/_lib/session';
import { signSession } from '@/infrastructure/auth/session-token';
import { ensureDrivers } from '@/__tests__/helpers/session';

/**
 * Change 25/29: session helper（requireDriverId 強制認證 + cookie helpers）。
 */
const reqWithCookie = (cookie?: string) =>
  new Request('http://localhost/api/x', cookie ? { headers: { cookie } } : undefined);

describe('Change 25/29: session helper', () => {
  beforeAll(() => ensureDrivers('drv-9', 'drv-2', 'drv-7', 'drv-1'));

  it('requireDriverId returns driverId from a valid session cookie', async () => {
    const token = signSession({ driverId: 'drv-9' }, getAuthSecret(), 3600_000);
    const req = reqWithCookie(`${SESSION_COOKIE}=${encodeURIComponent(token)}`);
    expect(await requireDriverId(req)).toBe('drv-9');
  });

  it('requireDriverId throws UnauthenticatedError when no/invalid cookie (Change 29: no DEFAULT fallback)', async () => {
    await expect(requireDriverId(reqWithCookie())).rejects.toThrow(UnauthenticatedError);
    await expect(requireDriverId(reqWithCookie(`${SESSION_COOKIE}=garbage`))).rejects.toThrow(UnauthenticatedError);
  });

  it('requireDriverId coexists with other cookies', async () => {
    const token = signSession({ driverId: 'drv-2' }, getAuthSecret(), 3600_000);
    const req = reqWithCookie(`theme=dark; ${SESSION_COOKIE}=${encodeURIComponent(token)}; x=1`);
    expect(await requireDriverId(req)).toBe('drv-2');
  });

  it('readSessionDriverId returns driverId for valid session, null otherwise (Change 26)', async () => {
    const token = signSession({ driverId: 'drv-7' }, getAuthSecret(), 3600_000);
    expect(await readSessionDriverId(reqWithCookie(`${SESSION_COOKIE}=${encodeURIComponent(token)}`))).toBe('drv-7');
    // 無 cookie / 亂碼 / 過期 → null（與 resolveDriverId 的 DEFAULT 後備區隔）
    expect(await readSessionDriverId(reqWithCookie())).toBeNull();
    expect(await readSessionDriverId(reqWithCookie(`${SESSION_COOKIE}=garbage`))).toBeNull();
    const expired = signSession({ driverId: 'drv-x' }, getAuthSecret(), -1000);
    expect(await readSessionDriverId(reqWithCookie(`${SESSION_COOKIE}=${encodeURIComponent(expired)}`))).toBeNull();
  });

  it('builds httpOnly set/clear cookies', async () => {
    const set = await sessionSetCookie('drv-1');
    expect(set).toContain(`${SESSION_COOKIE}=`);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Max-Age=\d+/);
    expect(sessionClearCookie()).toMatch(/Max-Age=0/);
  });

  it('rejects a cookie whose sessionVersion is stale or whose driver does not exist', async () => {
    const stale = signSession({ driverId: 'drv-1', sessionVersion: 99 }, getAuthSecret(), 3600_000);
    expect(await readSessionDriverId(reqWithCookie(`${SESSION_COOKIE}=${encodeURIComponent(stale)}`))).toBeNull();
    const ghost = signSession({ driverId: 'drv-ghost' }, getAuthSecret(), 3600_000);
    expect(await readSessionDriverId(reqWithCookie(`${SESSION_COOKIE}=${encodeURIComponent(ghost)}`))).toBeNull();
  });

  describe('Secure attribute (security audit 2026-11)', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('adds Secure to set/clear cookies in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('AUTH_SECRET', 'prod-test-secret-0123456789abcdef');
      expect(await sessionSetCookie('drv-1')).toMatch(/; Secure(;|$)/);
      expect(sessionClearCookie()).toMatch(/; Secure(;|$)/);
    });

    it('omits Secure outside production so http://localhost keeps working', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      expect(await sessionSetCookie('drv-1')).not.toMatch(/Secure/);
      expect(sessionClearCookie()).not.toMatch(/Secure/);
    });
  });
});
