import { describe, it, expect } from 'vitest';
import { getClientIp } from '@/app/_lib/client-ip';

const req = (headers: Record<string, string> = {}) => new Request('http://x/y', { headers });

describe('Change 49: getClientIp', () => {
  it('uses the first address in x-forwarded-for', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
  });
  it('trims whitespace', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '  203.0.113.7  ' }))).toBe('203.0.113.7');
  });
  it('falls back to the shared key "unknown" (never lets a request skip limiting)', () => {
    expect(getClientIp(req())).toBe('unknown');
    expect(getClientIp(req({ 'x-forwarded-for': '' }))).toBe('unknown');
    expect(getClientIp(req({ 'x-forwarded-for': ' , ' }))).toBe('unknown');
  });
});
