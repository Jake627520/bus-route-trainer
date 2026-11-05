import { NextResponse } from 'next/server';
import { sessionClearCookie, readSessionDriverId, SessionLookupError, sessionUnavailableResponse } from '@/app/_lib/session';
import { revokeSessions } from '@/infrastructure/auth/session-version';

/**
 * Change 25: POST /api/auth/logout — 清除 session cookie。
 * 資安稽核 2026-11：同時遞增 sessionVersion，讓這個 driver 已簽發的 cookie 在伺服器端失效
 * （包含其他裝置上的 session）。
 */
export async function POST(request?: Request): Promise<NextResponse> {
  try {
    const driverId = request ? await readSessionDriverId(request) : null;
    if (driverId) await revokeSessions(driverId);
  } catch (error) {
    if (!(error instanceof SessionLookupError)) console.error('[auth] logout revocation failed:', error);
    // 撤銷沒做成：仍清掉這台裝置的 cookie，但回 503 讓客戶端知道其他裝置的 session 可能還有效。
    const res = sessionUnavailableResponse();
    res.headers.set('Set-Cookie', sessionClearCookie());
    return res;
  }
  return NextResponse.json(
    { data: { ok: true } },
    { status: 200, headers: { 'Set-Cookie': sessionClearCookie() } }
  );
}
