import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readSessionDriverId } from '@/infrastructure/auth/session-cookie';

/**
 * Change 26: 頁面保護（Next 16 Proxy，原 middleware）。
 * - 未登入訪問受保護頁 → 導向 /login
 * - 已登入訪問 /login → 導回首頁
 * matcher 已排除 api / _next / 靜態資源；proxy 預設 Node.js runtime，可用 verifySession。
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession = readSessionDriverId(request) !== null;

  if (pathname === '/login') {
    return hasSession ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // 排除 api、Next 內部資源、常見 metadata 檔；其餘頁面都經過保護。
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
