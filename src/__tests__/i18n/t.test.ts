import { describe, it, expect } from 'vitest';
import { createT } from '@/i18n/t';
import { messages } from '@/i18n/messages';

/**
 * Change 30 Task 2: createT（巢狀 key 查找 + 內插 + 回退）。
 */
describe('Change 30: createT', () => {
  it('looks up nested keys per locale', () => {
    expect(createT('en')('login.titleLogin')).toBe('Sign in');
    expect(createT('zh-TW')('login.titleLogin')).toBe('登入');
    expect(createT('en')('home.sectionRoutes')).toBe('All routes');
    expect(createT('zh-TW')('home.sectionRoutes')).toBe('所有路線');
  });

  it('interpolates {var} placeholders', () => {
    expect(createT('en')('auth.signedInAs', { name: 'alice' })).toBe('Driver alice');
    expect(createT('zh-TW')('auth.signedInAs', { name: 'alice' })).toBe('司機 alice');
  });

  it('falls back to the key string when missing in both locales', () => {
    expect(createT('en')('nope.missing')).toBe('nope.missing');
  });

  it('both locales declare the same key shape', () => {
    const keysOf = (o: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object'
          ? keysOf(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`]
      );
    expect(keysOf(messages.en).sort()).toEqual(keysOf(messages['zh-TW']).sort());
  });
});
