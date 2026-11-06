import { describe, it, expect, afterEach, vi } from 'vitest';
import { getAppBaseUrl } from '@/infrastructure/auth/app-base-url';

/**
 * 稽核待辦 1：重設密碼連結的 base URL 不可取自 request（Host / X-Forwarded-Host 可被偽造）。
 * APP_URL 有設 → 一律用它；production 沒設 → fail closed（throw）；非 production 沒設 → 用 request origin。
 */
describe('getAppBaseUrl: reset-link base URL comes from config, not the request', () => {
  afterEach(() => vi.unstubAllEnvs());

  const spoofed = new Request('https://evil.example/api/auth/forgot', {
    headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' },
  });

  it('uses APP_URL and ignores a spoofed request origin', () => {
    vi.stubEnv('APP_URL', 'https://bus.example.com');
    expect(getAppBaseUrl(spoofed)).toBe('https://bus.example.com');
  });

  it('normalises APP_URL to its origin (drops trailing slash and path)', () => {
    vi.stubEnv('APP_URL', 'https://bus.example.com/some/path/');
    expect(getAppBaseUrl(spoofed)).toBe('https://bus.example.com');
  });

  it('fails closed in production when APP_URL is unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', '');
    expect(() => getAppBaseUrl(spoofed)).toThrow(/APP_URL/);
  });

  it('rejects an APP_URL that is not an http(s) URL', () => {
    vi.stubEnv('APP_URL', 'javascript:alert(1)');
    expect(() => getAppBaseUrl(spoofed)).toThrow(/APP_URL/);
    vi.stubEnv('APP_URL', 'not a url');
    expect(() => getAppBaseUrl(spoofed)).toThrow(/APP_URL/);
  });

  it('falls back to the request origin outside production when APP_URL is unset', () => {
    vi.stubEnv('APP_URL', '');
    expect(getAppBaseUrl(new Request('http://localhost:3000/api/auth/forgot'))).toBe('http://localhost:3000');
  });
});
