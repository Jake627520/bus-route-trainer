import { describe, it, expect } from 'vitest';
import { createT } from '@/i18n/t';
import { spokenHint } from '@/app/_lib/spoken-hint';

describe('Change 48 (fix): spokenHint (how a screen reader should say the hint)', () => {
  const en = createT('en');
  const zh = createT('zh-TW');

  it('reads a blank as a word, keeping spaces around it', () => {
    expect(spokenHint('Freesia St at ______', en)).toBe('Freesia St at blank');
    expect(spokenHint('______ Centre Station', en)).toBe('blank Centre Station');
    expect(spokenHint('Griffith University station, platform ______', en)).toBe(
      'Griffith University station, platform blank',
    );
  });

  it('never glues the word "blank" onto a letter (regression: "Cblank")', () => {
    const out = spokenHint('C________', en);
    expect(out).not.toContain('Cblank');
    expect(out).toBe('C, 9 letters');
  });

  it('reads each word of a first-letters hint with its length', () => {
    expect(spokenHint('B__ S______', en)).toBe('B, 3 letters S, 7 letters');
  });

  it('is translated', () => {
    expect(spokenHint('Freesia St at ______', zh)).toBe('Freesia St at 空格');
    expect(spokenHint('C________', zh)).toBe('C 開頭，共 9 個字母');
  });

  it('leaves a hint with no blank untouched', () => {
    expect(spokenHint('Cultural Centre Station', en)).toBe('Cultural Centre Station');
  });
});
