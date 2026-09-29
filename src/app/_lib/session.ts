import { signSession, verifySession } from '@/infrastructure/auth/session-token';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

export const SESSION_COOKIE = 'brt_session';
const TTL_MS = 7 * 24 * 3600 * 1000; // 7 天

/** AUTH_SECRET 由環境提供；未設時用不安全的 dev 後備（正式環境務必設定）。 */
export function getAuthSecret(): string {
  return process.env.AUTH_SECRET ?? 'dev-insecure-secret-change-me';
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/** 有效 session → 其 driverId；否則後備 DEFAULT_DRIVER_ID（Change 26 改為強制）。 */
export function resolveDriverId(request: Request): string {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return DEFAULT_DRIVER_ID;
  const payload = verifySession(token, getAuthSecret());
  return payload?.driverId ?? DEFAULT_DRIVER_ID;
}

export function sessionSetCookie(driverId: string): string {
  const token = signSession({ driverId }, getAuthSecret(), TTL_MS);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}`;
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
