import { NextResponse } from 'next/server';
import { sessionClearCookie } from '@/app/_lib/session';

/** Change 25: POST /api/auth/logout — 清除 session cookie。 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { data: { ok: true } },
    { status: 200, headers: { 'Set-Cookie': sessionClearCookie() } }
  );
}
