import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readSessionDriverId } from '@/infrastructure/auth/session-cookie';

/** 未登入也可訪問的頁面（認證相關）。 */
const PUBLIC_PATHS = new Set(['/login', '/forgot', '/reset']);

/**
 * Change 26 / 41: 頁面保護（Next 16 Proxy，原 middleware）。
 * - 未登入訪問受保護頁 → 導向 /login
 * - 已登入訪問 /login → 導回首頁
 * - /login、/forgot、/reset 未登入可達（密碼重設時本來就無法登入）
 * matcher 已排除 api / _next / 靜態資源；proxy 預設 Node.js runtime，可用 verifySession。
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession = readSessionDriverId(request) !== null;

  if (pathname === '/login') {
    return hasSession ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
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
