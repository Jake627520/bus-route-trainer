import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import manifest from '@/app/manifest';
import { BRAND_NAVY, BACKGROUND_LIGHT } from '@/pwa/brand';

const pub = (p: string) => path.join(process.cwd(), 'public', p.replace(/^\//, ''));
/** 讀 PNG 的 IHDR 取得寬高（不需要圖片套件）。 */
function pngSize(file: string): { w: number; h: number } {
  const b = fs.readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('Change 51: web app manifest', () => {
  const m = manifest();

  it('is installable as a standalone app starting at /', () => {
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.name).toBeTruthy();
    expect(m.short_name && m.short_name.length).toBeLessThanOrEqual(12);
  });

  it('uses the brand colours', () => {
    expect(m.theme_color).toBe(BRAND_NAVY);
    expect(m.background_color).toBe(BACKGROUND_LIGHT);
  });

  it('declares 192 and 512 icons, plus a maskable one', () => {
    const icons = m.icons ?? [];
    const has = (sizes: string, purpose?: string) =>
      icons.some((i) => i.sizes === sizes && (purpose ? i.purpose === purpose : i.purpose !== 'maskable'));
    expect(has('192x192')).toBe(true);
    expect(has('512x512')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
  });

  it('every declared icon file exists, is a PNG, and has the declared size', () => {
    for (const icon of m.icons ?? []) {
      const file = pub(icon.src);
      expect(fs.existsSync(file), icon.src).toBe(true);
      const [w, h] = (icon.sizes as string).split('x').map(Number);
      expect(pngSize(file), icon.src).toEqual({ w, h });
      expect(icon.type).toBe('image/png');
    }
  });

  it('ships an Apple touch icon (iOS ignores manifest icons)', () => {
    expect(pngSize(pub('apple-touch-icon.png'))).toEqual({ w: 180, h: 180 });
  });
});
