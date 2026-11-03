import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Change 25: 無狀態 session token = base64url(payload).base64url(HMAC-SHA256(payload))。
 * payload 含 { driverId, sv, exp }（exp 為毫秒 epoch）。
 * sv = 簽發當下的 Driver.sessionVersion；舊 token 沒有 sv，視為 0。
 */
export interface SessionPayload {
  driverId: string;
  sv: number;
  exp: number;
}

const b64url = (b: Buffer) => b.toString('base64url');

function hmac(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

export function signSession(
  data: { driverId: string; sessionVersion?: number },
  secret: string,
  ttlMs: number
): string {
  const payloadObj: SessionPayload = {
    driverId: data.driverId,
    sv: data.sessionVersion ?? 0,
    exp: Date.now() + ttlMs,
  };
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
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Partial<SessionPayload>;
    if (typeof obj.driverId !== 'string' || typeof obj.exp !== 'number') return null;
    if (obj.sv !== undefined && !Number.isInteger(obj.sv)) return null;
    if (Date.now() > obj.exp) return null;
    return { driverId: obj.driverId, sv: obj.sv ?? 0, exp: obj.exp };
  } catch {
    return null;
  }
}
