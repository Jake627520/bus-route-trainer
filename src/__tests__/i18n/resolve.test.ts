import { describe, it, expect } from 'vitest';
import { resolveLocale } from '@/i18n/resolve';
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/config';

/**
 * Change 30 Task 1: resolveLocale（cookie > Accept-Language，en 後備）。
 */
describe('Change 30: resolveLocale', () => {
  it('prefers a valid cookie locale over Accept-Language', () => {
    expect(resolveLocale('en-AU,en;q=0.9', 'zh-TW')).toBe('zh-TW');
    expect(resolveLocale('zh-TW,zh;q=0.9', 'en')).toBe('en');
  });

  it('ignores an invalid cookie and falls back to Accept-Language', () => {
    expect(resolveLocale('zh-TW,zh;q=0.9', 'fr')).toBe('zh-TW');
    expect(resolveLocale('en-US', 'nonsense')).toBe('en');
  });

  it('detects zh-TW from Accept-Language starting with zh', () => {
    expect(resolveLocale('zh-TW,zh;q=0.9,en;q=0.8', null)).toBe('zh-TW');
    expect(resolveLocale('zh-CN', null)).toBe('zh-TW'); // 任何 zh 變體都給繁中（目前只支援 zh-TW）
    expect(resolveLocale('zh', null)).toBe('zh-TW');
  });

  it('defaults to en for non-zh or empty Accept-Language', () => {
    expect(resolveLocale('en-AU,en;q=0.9', null)).toBe('en');
    expect(resolveLocale('fr-FR', null)).toBe('en');
    expect(resolveLocale('', null)).toBe('en');
    expect(resolveLocale(null, null)).toBe(DEFAULT_LOCALE);
  });

  it('only supports the declared LOCALES', () => {
    expect(LOCALES).toEqual(['en', 'zh-TW']);
    expect(DEFAULT_LOCALE).toBe('en');
  });
});
