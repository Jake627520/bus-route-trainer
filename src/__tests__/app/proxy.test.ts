import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { proxy, config } from '@/proxy';
import { signSession } from '@/infrastructure/auth/session-token';
import { SESSION_COOKIE, getAuthSecret } from '@/infrastructure/auth/session-cookie';

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
  it('redirects unauthenticated visitors to /login', () => {
    const res = proxy(req('/'));
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });

  it('lets authenticated visitors through', () => {
    const res = proxy(req('/', { session: 'drv-1' }));
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects authenticated visitors away from /login to home', () => {
    const res = proxy(req('/login', { session: 'drv-1' }));
    expect(res.headers.get('location')).toBe('http://localhost/');
  });

  it('lets unauthenticated visitors reach /login', () => {
    const res = proxy(req('/login'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('matcher excludes api / _next / static assets, includes app pages', () => {
    const nextConfig = {};
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: '/' })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: '/practice/recall' })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: '/api/auth/login' })).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: '/_next/static/chunk.js' })).toBe(false);
  });
});
