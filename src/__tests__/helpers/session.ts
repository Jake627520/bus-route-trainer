import { signSession } from '@/infrastructure/auth/session-token';
import { SESSION_COOKIE, getAuthSecret } from '@/infrastructure/auth/session-cookie';

/** 測試用：產生指定 driver 的簽章 session cookie header 值（Change 29 後 API 一律需認證）。 */
export function sessionCookie(driverId: string): string {
  const token = signSession({ driverId }, getAuthSecret(), 3600_000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
}

/** 測試用：帶 session cookie 的 headers 物件（可合併其他 headers）。 */
export function authHeaders(driverId: string, extra: Record<string, string> = {}): Record<string, string> {
  return { cookie: sessionCookie(driverId), ...extra };
}
