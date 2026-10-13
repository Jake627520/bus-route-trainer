import { describe, it, expect } from 'vitest';
import { buildStopQuestion } from '@/domain/recall/stop-question';
import { RecallMode } from '@/domain/recall/recall-session';

/**
 * Change 45: 出題與批改共用的推導邏輯。
 * 站名取自真實 SEQ GTFS feed。
 */
describe('Change 45: buildStopQuestion', () => {
  it('builds a cross-street fill-in question for a normal stop', () => {
    const q = buildStopQuestion('STOP::S1', 'Freesia St at Muirfield Street, stop 85', 'S1');
    expect(q.mode).toBe(RecallMode.CROSS_STREET_RECALL);
    expect(q.givenReference).toBe('Freesia St at ______');
    expect(q.expectedAnswer).toBe('Muirfield Street');
  });

  it('keeps the near relation in the hint', () => {
    const q = buildStopQuestion('STOP::S2', 'Granadilla St near Darlington St, stop 7', 'S2');
    expect(q.givenReference).toBe('Granadilla St near ______');
    expect(q.expectedAnswer).toBe('Darlington St');
  });

  // 關鍵：提示絕不可以包含答案
  it('never leaks the answer inside the hint', () => {
    const q = buildStopQuestion('STOP::S1', 'Freesia St at Muirfield Street, stop 85', 'S1');
    expect(q.givenReference).not.toContain('Muirfield');
  });

  it('builds a stop-number question from a STOP_NUM card', () => {
    const q = buildStopQuestion('STOP_NUM::S1', 'Freesia St at Muirfield Street, stop 85', 'S1');
    expect(q.mode).toBe(RecallMode.STOP_NUMBER_RECALL);
    expect(q.givenReference).toBe('Freesia St at Muirfield Street');
    expect(q.expectedAnswer).toBe('85');
  });

  // Change 47: 沒有路口 / 站號的站改出「單字填空」，不再把答案寫在題目上
  it('masks the platform number for a station platform', () => {
    const q = buildStopQuestion('STOP::S9', 'Griffith University station, platform 1', 'S9');
    expect(q.mode).toBe(RecallMode.WORD_CLOZE_RECALL);
    expect(q.givenReference).toBe('Griffith University station, platform ______');
    expect(q.expectedAnswer).toBe('1');
  });

  it('masks the most distinctive word of a plain station name', () => {
    const q = buildStopQuestion('STOP::S3', 'Cultural Centre Station', 'S3');
    expect(q.mode).toBe(RecallMode.WORD_CLOZE_RECALL);
    expect(q.givenReference).toBe('______ Centre Station');
    expect(q.expectedAnswer).toBe('Cultural');
  });

  it('skips generic words and picks the first among equally long words', () => {
    const q = buildStopQuestion('STOP::S4', 'Interchange Roma Street busway station', 'S4');
    expect(q.expectedAnswer).toBe('Street');
    expect(q.givenReference).toBe('Interchange Roma ______ busway station');
  });

  it('gives only first letters when the name is a single word', () => {
    const q = buildStopQuestion('STOP::S6', 'Chermside', 'S6');
    expect(q.mode).toBe(RecallMode.WORD_CLOZE_RECALL);
    expect(q.givenReference).toBe('C________');
    expect(q.expectedAnswer).toBe('Chermside');
  });

  it('gives first letters of each word when every word is generic', () => {
    const q = buildStopQuestion('STOP::S7', 'Bus Station', 'S7');
    expect(q.givenReference).toBe('B__ S______');
    expect(q.expectedAnswer).toBe('Bus Station');
  });

  it('never leaks the answer for any cloze question', () => {
    const names = [
      'Griffith University station, platform 1',
      'Cultural Centre Station',
      'Interchange Roma Street busway station',
      'West End Cityglider terminus',
      'Chermside',
      'Bus Station',
    ];
    for (const name of names) {
      const q = buildStopQuestion('STOP::X', name, 'X');
      expect(q.mode).toBe(RecallMode.WORD_CLOZE_RECALL);
      const hintWords = q.givenReference.toLowerCase().split(/[\s,]+/);
      expect(hintWords).not.toContain(q.expectedAnswer.toLowerCase());
      expect(q.givenReference.toLowerCase()).not.toBe(name.toLowerCase());
    }
  });

  it('falls back to a cloze when a STOP_NUM card has lost its number', () => {
    const q = buildStopQuestion('STOP_NUM::S9', 'West End Cityglider terminus', 'S9');
    expect(q.mode).toBe(RecallMode.WORD_CLOZE_RECALL);
    expect(q.expectedAnswer).toBe('Cityglider');
  });

  it('uses the stop id when the name is missing', () => {
    const q = buildStopQuestion('STOP::S5', null, 'S5');
    expect(q.expectedAnswer).toBe('S5');
    expect(q.givenReference).toBe('S_');
  });
});
