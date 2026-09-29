import { signSession } from '@/infrastructure/auth/session-token';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  getAuthSecret,
  readSessionDriverId,
} from '@/infrastructure/auth/session-cookie';

// Re-export（保留既有 import 路徑 @/app/_lib/session）。
export { SESSION_COOKIE, getAuthSecret, readSessionDriverId };

/** 有效 session → 其 driverId；否則後備 DEFAULT_DRIVER_ID（相容 zero-auth；頁面保護由 proxy 負責）。 */
export function resolveDriverId(request: Request): string {
  return readSessionDriverId(request) ?? DEFAULT_DRIVER_ID;
}

export function sessionSetCookie(driverId: string): string {
  const token = signSession({ driverId }, getAuthSecret(), SESSION_TTL_MS);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
