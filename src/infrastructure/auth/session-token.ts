import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Change 25: 無狀態 session token = base64url(payload).base64url(HMAC-SHA256(payload))。
 * payload 含 { driverId, exp }（exp 為毫秒 epoch）。
 */
export interface SessionPayload {
  driverId: string;
  exp: number;
}

const b64url = (b: Buffer) => b.toString('base64url');

function hmac(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

export function signSession(
  data: { driverId: string },
  secret: string,
  ttlMs: number
): string {
  const payloadObj: SessionPayload = { driverId: data.driverId, exp: Date.now() + ttlMs };
  const payload = b64url(Buffer.from(JSON.stringify(payloadObj)));
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifySession(token: string, secret: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = hmac(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionPayload;
    if (typeof obj.driverId !== 'string' || typeof obj.exp !== 'number') return null;
    if (Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}
