import { describe, it, expect } from 'vitest';
import {
  DeterministicRecallEvaluator,
  normalizeStopNameLenient,
} from '@/domain/recall/deterministic-evaluator';
import { RecallMode, RecallOutcome } from '@/domain/recall/recall-session';

/**
 * Change 43: 寬鬆比對。
 * 真實 Translink 站名又長又多標點（例：`Adelaide St at King George Square, stop 25`），
 * 完全精確比對會讓人答不完。改為忽略標點與常見縮寫差異，
 * 但**仍不給部分分數**——少字、錯字一樣算錯。
 */
describe('Change 43: lenient stop-name matching', () => {
  const evaluator = new DeterministicRecallEvaluator();
  const pass = (input: string, expected: string) =>
    evaluator.evaluate(RecallMode.STOP_NAME_RECOGNITION, input, expected);

  describe('normalizeStopNameLenient', () => {
    it('unifies street-type abbreviations to a canonical short form', () => {
      expect(normalizeStopNameLenient('Queen Street')).toBe(normalizeStopNameLenient('Queen St'));
      expect(normalizeStopNameLenient('Logan Road')).toBe(normalizeStopNameLenient('Logan Rd'));
      expect(normalizeStopNameLenient('Central Station')).toBe(normalizeStopNameLenient('Central Stn'));
    });

    it('treats Saint and St as the same token', () => {
      expect(normalizeStopNameLenient('St Lucia')).toBe(normalizeStopNameLenient('Saint Lucia'));
    });

    it('drops punctuation', () => {
      expect(normalizeStopNameLenient("Queen's Plaza, Level 1")).toBe(
        normalizeStopNameLenient('Queens Plaza Level 1'),
      );
    });

    it('drops a trailing platform/stop suffix', () => {
      expect(normalizeStopNameLenient('King George Square, stop 25')).toBe(
        normalizeStopNameLenient('King George Square'),
      );
      expect(normalizeStopNameLenient('Cultural Centre stop B')).toBe(
        normalizeStopNameLenient('Cultural Centre'),
      );
    });
  });

  describe('evaluate', () => {
    it.each([
      ['Adelaide St at King George Square, stop 25', 'Adelaide Street at King George Square'],
      ['queen st mall', 'Queen Street Mall'],
      ['  Roma   Street   Station  ', 'Roma St Stn'],
      ["Queens Plaza", "Queen's Plaza"],
    ])('accepts %s against %s', (input, expected) => {
      expect(pass(input, expected)).toBe(RecallOutcome.PASS);
    });

    // 寬鬆 ≠ 給部分分數
    it.each([
      ['King George', 'King George Square'],
      ['Kng George Square', 'King George Square'],
      ['Central Station', 'Roma Street Station'],
      ['', 'Roma Street Station'],
    ])('still rejects %s against %s', (input, expected) => {
      expect(pass(input, expected)).toBe(RecallOutcome.FAIL);
    });
  });

  // Change 43: next-stop 題改為比對「站名」（原本比對原始 stop ID，等於無法作答）
  describe('NEXT_STOP_FORWARD now compares stop names leniently', () => {
    it('accepts the next stop name regardless of case and abbreviation', () => {
      expect(
        evaluator.evaluate(RecallMode.NEXT_STOP_FORWARD, 'roma st station', 'Roma Street Station'),
      ).toBe(RecallOutcome.PASS);
    });

    it('rejects a different stop', () => {
      expect(
        evaluator.evaluate(RecallMode.NEXT_STOP_FORWARD, 'Central Station', 'Roma Street Station'),
      ).toBe(RecallOutcome.FAIL);
    });
  });
});
