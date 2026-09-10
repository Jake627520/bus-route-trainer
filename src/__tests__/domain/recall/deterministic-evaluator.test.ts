import { describe, it, expect } from 'vitest';
import {
  DeterministicRecallEvaluator,
  normalizeStopName,
} from '../../../domain/recall/deterministic-evaluator';
import { RecallMode, RecallOutcome } from '../../../domain/recall/recall-session';

describe('DeterministicRecallEvaluator & normalizeStopName', () => {
  const evaluator = new DeterministicRecallEvaluator();

  describe('normalizeStopName', () => {
    it('normalizes full-width Unicode characters via NFKC', () => {
      // Full-width letters and numbers
      const fullWidth = 'Ｋｉｎｇ　Ｇｅｏｒｇｅ　Ｓｑｕａｒｅ';
      expect(normalizeStopName(fullWidth)).toBe('king george square');
    });

    it('trims leading and trailing whitespace and converts to lowercase', () => {
      expect(normalizeStopName('  Queen Street Mall  ')).toBe('queen street mall');
    });

    it('collapses multiple spaces, tabs, and newlines into a single space', () => {
      expect(normalizeStopName('Cultural \t\n  Centre   Station')).toBe('cultural centre station');
    });

    it('returns empty string when input is only whitespace', () => {
      expect(normalizeStopName('   \t  \n  ')).toBe('');
    });
  });

  describe('evaluate NEXT_STOP_FORWARD', () => {
    it('returns PASS on exact canonical stopId match (with trimming)', () => {
      const outcome = evaluator.evaluate(
        RecallMode.NEXT_STOP_FORWARD,
        'stop_123',
        'stop_123',
      );
      expect(outcome).toBe(RecallOutcome.PASS);

      // Trimming allowed on input
      const trimmedOutcome = evaluator.evaluate(
        RecallMode.NEXT_STOP_FORWARD,
        '  stop_123  ',
        'stop_123',
      );
      expect(trimmedOutcome).toBe(RecallOutcome.PASS);
    });

    it('returns FAIL on stopId mismatch', () => {
      const outcome = evaluator.evaluate(
        RecallMode.NEXT_STOP_FORWARD,
        'stop_999',
        'stop_123',
      );
      expect(outcome).toBe(RecallOutcome.FAIL);
    });

    it('returns FAIL on empty or whitespace-only input', () => {
      expect(
        evaluator.evaluate(RecallMode.NEXT_STOP_FORWARD, '', 'stop_123'),
      ).toBe(RecallOutcome.FAIL);
      expect(
        evaluator.evaluate(RecallMode.NEXT_STOP_FORWARD, '   ', 'stop_123'),
      ).toBe(RecallOutcome.FAIL);
    });

    it('strictly avoids case-folding stopId if case matters, or enforces exact match', () => {
      expect(
        evaluator.evaluate(RecallMode.NEXT_STOP_FORWARD, 'STOP_123', 'stop_123'),
      ).toBe(RecallOutcome.FAIL);
    });
  });

  describe('evaluate STOP_NAME_RECOGNITION', () => {
    it('returns PASS when normalized input equals pre-normalized expectedAnswer', () => {
      const outcome = evaluator.evaluate(
        RecallMode.STOP_NAME_RECOGNITION,
        '  King   George   Square  ',
        'king george square',
      );
      expect(outcome).toBe(RecallOutcome.PASS);
    });

    it('handles full-width Japanese/Unicode characters', () => {
      const outcome = evaluator.evaluate(
        RecallMode.STOP_NAME_RECOGNITION,
        'Ｒｏｍａ　Ｓｔｒｅｅｔ',
        'roma street',
      );
      expect(outcome).toBe(RecallOutcome.PASS);
    });

    it('returns FAIL on name mismatch', () => {
      const outcome = evaluator.evaluate(
        RecallMode.STOP_NAME_RECOGNITION,
        'Central Station',
        'king george square',
      );
      expect(outcome).toBe(RecallOutcome.FAIL);
    });

    it('returns FAIL on empty or whitespace-only input', () => {
      expect(
        evaluator.evaluate(RecallMode.STOP_NAME_RECOGNITION, '   ', 'king george square'),
      ).toBe(RecallOutcome.FAIL);
    });

    it('strictly excludes partial matches or fuzzy credit', () => {
      // Missing word or typo
      expect(
        evaluator.evaluate(RecallMode.STOP_NAME_RECOGNITION, 'King George', 'king george square'),
      ).toBe(RecallOutcome.FAIL);
      expect(
        evaluator.evaluate(RecallMode.STOP_NAME_RECOGNITION, 'Kng George Sq', 'king george square'),
      ).toBe(RecallOutcome.FAIL);
    });
  });
});
