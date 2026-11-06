import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { proxy, config } from '@/proxy';
import { signSession } from '@/infrastructure/auth/session-token';
import { SESSION_COOKIE, getAuthSecret } from '@/infrastructure/auth/session-cookie';
import { ensureDrivers } from '@/__tests__/helpers/session';

/**
 * Change 26 Task 5: 頁面保護 proxy（Next 16）。
 * 未登入訪受保護頁→導 /login；已登入訪 /login→導 /。
 */
const req = (path: string, opts?: { session?: string }) => {
  const headers: Record<string, string> = {};
  if (opts?.session) {
    const token = signSession({ driverId: opts.session }, getAuthSecret(), 3600_000);
    headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
  }
  return new NextRequest(new URL(`http://localhost${path}`), { headers });
};

describe('Change 26: page-protection proxy', () => {
  beforeAll(() => ensureDrivers('drv-1'));

  it('redirects unauthenticated visitors to /login', async () => {
    const res = await proxy(req('/'));
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });

  it('lets authenticated visitors through', async () => {
    const res = await proxy(req('/', { session: 'drv-1' }));
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects authenticated visitors away from /login to home', async () => {
    const res = await proxy(req('/login', { session: 'drv-1' }));
    expect(res.headers.get('location')).toBe('http://localhost/');
  });

  it('lets unauthenticated visitors reach /login', async () => {
    const res = await proxy(req('/login'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('matcher excludes api / _next / static assets, includes app pages', () => {
    const nextConfig = {};
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: '/' })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: '/practice/recall' })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: '/api/auth/login' })).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: '/_next/static/chunk.js' })).toBe(false);
  });

  // Change 51: PWA 檔案必須不需登入（否則未登入時安裝／離線頁都會被導向 /login）
  it('does not run on PWA files (manifest, service worker, icons, offline page)', () => {
    const nextConfig = {};
    for (const url of [
      '/manifest.webmanifest',
      '/sw.js',
      '/offline.html',
      '/icon-192.png',
      '/icon-512.png',
      '/icon-maskable-512.png',
      '/apple-touch-icon.png',
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig, url }), url).toBe(false);
    }
  });

  it('still protects ordinary pages that merely look similar', () => {
    const nextConfig = {};
    for (const url of ['/offline', '/routes/R1', '/practice/recall', '/icons']) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig, url }), url).toBe(true);
    }
  });

  // Change 52: cron 與推播 API 走自己的驗證（密鑰／session），不能被頁面導向 /login 擋住。
  it('does not run on the push and cron APIs', () => {
    const nextConfig = {};
    for (const url of ['/api/cron/review-reminders', '/api/push/subscribe', '/api/push/unsubscribe']) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig, url }), url).toBe(false);
    }
  });
});
