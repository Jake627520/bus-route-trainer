import { NextResponse } from 'next/server';
import { signSession } from '@/infrastructure/auth/session-token';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  getAuthSecret,
  readSessionDriverId,
} from '@/infrastructure/auth/session-cookie';

// Re-export（保留既有 import 路徑 @/app/_lib/session）。
export { SESSION_COOKIE, getAuthSecret, readSessionDriverId };

/** Change 29：未登入。route 捕捉後回 401。 */
export class UnauthenticatedError extends Error {
  constructor(message = 'Authentication required. Please sign in.') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

/** 有效 session → driverId；否則 throw UnauthenticatedError（Change 29：強制認證，無 DEFAULT 後備）。 */
export function requireDriverId(request: Request): string {
  const driverId = readSessionDriverId(request);
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

export function sessionSetCookie(driverId: string): string {
  const token = signSession({ driverId }, getAuthSecret(), SESSION_TTL_MS);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
