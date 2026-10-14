import { describe, it, expect } from 'vitest';
import nextConfig from '../../../next.config';

describe('Change 51: /sw.js response headers (per the Next.js PWA guide)', () => {
  it('serves the worker uncached, as JavaScript, with nosniff and a strict CSP', async () => {
    const rules = await nextConfig.headers!();
    const sw = rules.find((r) => r.source === '/sw.js');
    expect(sw).toBeDefined();
    const h = Object.fromEntries(sw!.headers.map((x) => [x.key.toLowerCase(), x.value]));
    expect(h['content-type']).toBe('application/javascript; charset=utf-8');
    expect(h['cache-control']).toBe('no-cache, no-store, must-revalidate');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['content-security-policy']).toBe("default-src 'self'; script-src 'self'");
  });

  it('allows the worker to control the whole site', async () => {
    const rules = await nextConfig.headers!();
    const sw = rules.find((r) => r.source === '/sw.js')!;
    expect(sw.headers.find((x) => x.key === 'Service-Worker-Allowed')?.value).toBe('/');
  });
});
