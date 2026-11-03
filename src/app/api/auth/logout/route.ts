import { NextResponse } from 'next/server';
import { sessionClearCookie, readSessionDriverId } from '@/app/_lib/session';
import { revokeSessions } from '@/infrastructure/auth/session-version';

/**
 * Change 25: POST /api/auth/logout — 清除 session cookie。
 * 資安稽核 2026-11：同時遞增 sessionVersion，讓這個 driver 已簽發的 cookie 在伺服器端失效
 * （包含其他裝置上的 session）。
 */
export async function POST(request?: Request): Promise<NextResponse> {
  const driverId = request ? await readSessionDriverId(request) : null;
  if (driverId) await revokeSessions(driverId);
  return NextResponse.json(
    { data: { ok: true } },
    { status: 200, headers: { 'Set-Cookie': sessionClearCookie() } }
  );
}
