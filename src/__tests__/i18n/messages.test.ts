import { describe, it, expect } from 'vitest';
import { messages } from '@/i18n/messages';
import { createT } from '@/i18n/create-t';
import { LOCALES } from '@/i18n/config';

describe('Change 30: messages + createT', () => {
  it('every locale has exactly the same keys', () => {
    const base = Object.keys(messages['zh-TW']).sort();
    for (const l of LOCALES) expect(Object.keys(messages[l]).sort()).toEqual(base);
  });
  it('translates by locale', () => {
    expect(createT('zh-TW')('login.title')).toBe('登入');
    expect(createT('en')('login.title')).toBe('Sign in');
  });
  it('interpolates {params}', () => {
    const t = createT('en');
    expect(t('test.hello', { name: 'Ann' })).toBe('Hello, Ann!');
  });
  it('returns the key when missing', () => {
    expect(createT('en')('no.such.key' as never)).toBe('no.such.key');
  });
});
