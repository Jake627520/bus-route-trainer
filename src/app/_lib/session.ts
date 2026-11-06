import { NextResponse } from 'next/server';
import { signSession } from '@/infrastructure/auth/session-token';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  getAuthSecret,
  readSessionDriverId,
  SessionLookupError,
} from '@/infrastructure/auth/session-cookie';
import { currentSessionVersion } from '@/infrastructure/auth/session-version';

// Re-export（保留既有 import 路徑 @/app/_lib/session）。
export { SESSION_COOKIE, getAuthSecret, readSessionDriverId, SessionLookupError };

/** Change 29：未登入。route 捕捉後回 401。 */
export class UnauthenticatedError extends Error {
  constructor(message = 'Authentication required. Please sign in.') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

/** 有效且未撤銷的 session → driverId；否則 throw UnauthenticatedError（Change 29：強制認證，無 DEFAULT 後備）。 */
export async function requireDriverId(request: Request): Promise<string> {
  const driverId = await readSessionDriverId(request);
  if (!driverId) throw new UnauthenticatedError();
  return driverId;
}

/** 標準 401 回應（未登入）。 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: 'UNAUTHENTICATED', message: 'Authentication required. Please sign in.' } },
    { status: 401 }
  );
}

/** 標準 503 回應（暫時無法驗證 session，例如 DB 失敗）。不帶任何例外細節。 */
export function sessionUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable. Please try again.' } },
    { status: 503 }
  );
}

/** production 一律加 Secure；本機 http://localhost 開發不加，否則瀏覽器不送 cookie。 */
const secureAttr = (): string => (process.env.NODE_ENV === 'production' ? '; Secure' : '');

/** 簽發 session cookie，帶入 driver 目前的 sessionVersion（撤銷用）。 */
export async function sessionSetCookie(driverId: string): Promise<string> {
  const sessionVersion = (await currentSessionVersion(driverId)) ?? 0;
  const token = signSession({ driverId, sessionVersion }, getAuthSecret(), SESSION_TTL_MS);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secureAttr()}; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secureAttr()}; Max-Age=0`;
}
