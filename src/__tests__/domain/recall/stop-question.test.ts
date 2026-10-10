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

  it('falls back to name recognition for a station platform', () => {
    const q = buildStopQuestion('STOP::S9', 'Griffith University station, platform 1', 'S9');
    expect(q.mode).toBe(RecallMode.STOP_NAME_RECOGNITION);
    expect(q.expectedAnswer).toBe('Griffith University station, platform 1');
  });

  it('falls back when a STOP_NUM card has lost its number', () => {
    const q = buildStopQuestion('STOP_NUM::S9', 'West End Cityglider terminus', 'S9');
    expect(q.mode).toBe(RecallMode.STOP_NAME_RECOGNITION);
  });

  it('uses the stop id when the name is missing', () => {
    const q = buildStopQuestion('STOP::S5', null, 'S5');
    expect(q.expectedAnswer).toBe('S5');
  });
});
