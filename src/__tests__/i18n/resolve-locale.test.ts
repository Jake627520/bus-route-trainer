import { describe, it, expect } from 'vitest';
import { resolveLocale } from '@/i18n/resolve-locale';

describe('Change 30: resolveLocale', () => {
  it('valid cookie wins over Accept-Language', () => {
    expect(resolveLocale({ cookie: 'zh-TW', acceptLanguage: 'en-US,en;q=0.9' })).toBe('zh-TW');
    expect(resolveLocale({ cookie: 'en', acceptLanguage: 'zh-TW' })).toBe('en');
  });
  it('ignores invalid cookie and falls through to Accept-Language', () => {
    expect(resolveLocale({ cookie: 'fr', acceptLanguage: 'zh-TW,zh;q=0.9' })).toBe('zh-TW');
  });
  it('maps any zh* tag to zh-TW', () => {
    expect(resolveLocale({ acceptLanguage: 'zh-HK' })).toBe('zh-TW');
    expect(resolveLocale({ acceptLanguage: 'zh' })).toBe('zh-TW');
  });
  it('maps en* to en', () => {
    expect(resolveLocale({ acceptLanguage: 'en-GB' })).toBe('en');
  });
  it('respects q-values ordering', () => {
    expect(resolveLocale({ acceptLanguage: 'en;q=0.5,zh-TW;q=0.9' })).toBe('zh-TW');
    expect(resolveLocale({ acceptLanguage: 'zh-TW;q=0.2,en;q=0.8' })).toBe('en');
  });
  it('falls back to en when nothing matches or input missing', () => {
    expect(resolveLocale({ acceptLanguage: 'fr-FR,de;q=0.8' })).toBe('en');
    expect(resolveLocale({})).toBe('en');
    expect(resolveLocale({ cookie: null, acceptLanguage: null })).toBe('en');
  });
});
