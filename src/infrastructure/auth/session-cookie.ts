import { verifySession } from './session-token';

/** 簽章 session cookie 的名稱。 */
export const SESSION_COOKIE = 'brt_session';

/** session cookie 存活時間（7 天，毫秒）。 */
export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

const DEV_INSECURE_SECRET = 'dev-insecure-secret-change-me';

/**
 * AUTH_SECRET 由環境提供。
 * - 非 production：未設時退回不安全的 dev 後備（方便本地/測試）。
 * - production：未設或仍是 dev 後備值 → throw（避免用可預測密鑰簽 session）。
 */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    if (!secret || secret.length === 0 || secret === DEV_INSECURE_SECRET) {
      throw new Error(
        'AUTH_SECRET must be set to a strong, unique value in production (the insecure dev fallback is not allowed).'
      );
    }
    return secret;
  }
  return secret && secret.length > 0 ? secret : DEV_INSECURE_SECRET;
}

/** 從 Cookie header 取出指定 cookie 值（decode 後）。 */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/** 有效且未過期的 session → 其 driverId；無 cookie / 竄改 / 過期 → null。 */
export function readSessionDriverId(request: Request): string | null {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const payload = verifySession(token, getAuthSecret());
  return payload?.driverId ?? null;
}
