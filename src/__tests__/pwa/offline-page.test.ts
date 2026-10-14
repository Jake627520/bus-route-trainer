import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.join(process.cwd(), 'public', 'offline.html'), 'utf8');

/** 把離線頁放進 jsdom，並執行頁面內的小腳本（模擬瀏覽器語言）。 */
function render(language: string) {
  Object.defineProperty(window.navigator, 'language', { value: language, configurable: true });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.documentElement.innerHTML = doc.documentElement.innerHTML;
  const script = [...doc.querySelectorAll('script')].map((s) => s.textContent).join('\n');
  (0, eval)(script);
  const visible = (lang: string) => {
    const el = document.querySelector<HTMLElement>(`[data-lang="${lang}"]`);
    return !!el && !el.hidden;
  };
  return { en: visible('en'), zh: visible('zh-TW') };
}

describe('Change 51: offline page', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '';
  });

  it('is a complete, mobile-friendly HTML document', () => {
    expect(html.trimStart().toLowerCase().startsWith('<!doctype html>')).toBe(true);
    expect(html).toMatch(/<meta charset="utf-8"/i);
    expect(html).toMatch(/<meta name="viewport"/i);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });

  it('works with nothing but itself: no external scripts, styles, images or fonts', () => {
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i);
    expect(html).not.toMatch(/url\(\s*["']?\s*(?:https?:)?\/\//i);
    expect(html).not.toMatch(/@import/i);
  });

  it('has both English and Traditional Chinese text', () => {
    expect(html).toContain("You're offline");
    expect(html).toContain('目前離線');
  });

  it('shows Chinese for a zh browser and English otherwise', () => {
    expect(render('zh-TW')).toEqual({ en: false, zh: true });
    expect(render('zh-HK')).toEqual({ en: false, zh: true });
    expect(render('en-AU')).toEqual({ en: true, zh: false });
    expect(render('fr-FR')).toEqual({ en: true, zh: false });
  });

  it('shows both languages when scripts do not run (progressive enhancement)', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('[data-lang]').length).toBe(2);
    expect([...doc.querySelectorAll<HTMLElement>('[data-lang]')].every((e) => !e.hidden)).toBe(true);
  });

  it('has a retry button that reloads the page', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const buttons = doc.querySelectorAll('button[type="button"]');
    expect(buttons.length).toBeGreaterThanOrEqual(2); // 每種語言一個
    expect(html).toContain('location.reload');
  });
});
