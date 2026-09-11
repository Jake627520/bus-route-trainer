import { describe, it, expect } from 'vitest';
import { CardState } from '@/domain/learning/learning-card';
import { ProgressStatus } from '@/domain/learning/driver-variant-progress';
import {
  evaluateCardTransition,
  calculateNextRepetitions,
  calculateNextLapses,
  calculateVariantProgressStatus,
  calculateVariantProgressPercent,
} from '@/domain/learning/evaluate-card-transition';

describe('evaluateCardTransition', () => {
  describe('State Transition Matrix (4x2)', () => {
    it('(1) NEW + PASS -> LEARNING', () => {
      expect(evaluateCardTransition(CardState.NEW, 'PASS')).toBe(CardState.LEARNING);
    });

    it('(2) NEW + FAIL -> LEARNING', () => {
      expect(evaluateCardTransition(CardState.NEW, 'FAIL')).toBe(CardState.LEARNING);
    });

    it('(3) LEARNING + PASS -> REVIEW', () => {
      expect(evaluateCardTransition(CardState.LEARNING, 'PASS')).toBe(CardState.REVIEW);
    });

    it('(4) LEARNING + FAIL -> LEARNING', () => {
      expect(evaluateCardTransition(CardState.LEARNING, 'FAIL')).toBe(CardState.LEARNING);
    });

    it('(5) REVIEW + PASS -> MASTERED', () => {
      expect(evaluateCardTransition(CardState.REVIEW, 'PASS')).toBe(CardState.MASTERED);
    });

    it('(6) REVIEW + FAIL -> LEARNING', () => {
      expect(evaluateCardTransition(CardState.REVIEW, 'FAIL')).toBe(CardState.LEARNING);
    });

    it('(7) MASTERED + PASS -> MASTERED', () => {
      expect(evaluateCardTransition(CardState.MASTERED, 'PASS')).toBe(CardState.MASTERED);
    });

    it('(8) MASTERED + FAIL -> REVIEW', () => {
      expect(evaluateCardTransition(CardState.MASTERED, 'FAIL')).toBe(CardState.REVIEW);
    });
  });

  describe('Repetitions Invariant', () => {
    it('increments repetitions by +1 on PASS', () => {
      expect(calculateNextRepetitions(0, 'PASS')).toBe(1);
      expect(calculateNextRepetitions(5, 'PASS')).toBe(6);
    });

    it('retains repetitions on FAIL (never resets to 0)', () => {
      expect(calculateNextRepetitions(0, 'FAIL')).toBe(0);
      expect(calculateNextRepetitions(7, 'FAIL')).toBe(7);
    });
  });

  describe('Lapses Invariant', () => {
    it('does NOT increment lapses on NEW + FAIL', () => {
      expect(calculateNextLapses(0, CardState.NEW, 'FAIL')).toBe(0);
      expect(calculateNextLapses(2, CardState.NEW, 'FAIL')).toBe(2);
    });

    it('does NOT increment lapses on LEARNING + FAIL', () => {
      expect(calculateNextLapses(0, CardState.LEARNING, 'FAIL')).toBe(0);
      expect(calculateNextLapses(3, CardState.LEARNING, 'FAIL')).toBe(3);
    });

    it('increments lapses by +1 on REVIEW + FAIL', () => {
      expect(calculateNextLapses(0, CardState.REVIEW, 'FAIL')).toBe(1);
      expect(calculateNextLapses(1, CardState.REVIEW, 'FAIL')).toBe(2);
    });

    it('increments lapses by +1 on MASTERED + FAIL', () => {
      expect(calculateNextLapses(0, CardState.MASTERED, 'FAIL')).toBe(1);
      expect(calculateNextLapses(4, CardState.MASTERED, 'FAIL')).toBe(5);
    });

    it('does NOT increment lapses on any PASS', () => {
      expect(calculateNextLapses(2, CardState.NEW, 'PASS')).toBe(2);
      expect(calculateNextLapses(2, CardState.LEARNING, 'PASS')).toBe(2);
      expect(calculateNextLapses(2, CardState.REVIEW, 'PASS')).toBe(2);
      expect(calculateNextLapses(2, CardState.MASTERED, 'PASS')).toBe(2);
    });
  });

  describe('Variant Progress Status', () => {
    it('returns NOT_STARTED when cards array is empty', () => {
      expect(calculateVariantProgressStatus([])).toBe(ProgressStatus.NOT_STARTED);
    });

    it('returns NOT_STARTED when all cards are NEW', () => {
      const cards = [{ state: CardState.NEW }, { state: CardState.NEW }];
      expect(calculateVariantProgressStatus(cards)).toBe(ProgressStatus.NOT_STARTED);
    });

    it('returns IN_PROGRESS when at least one card is LEARNING or REVIEW', () => {
      const cards1 = [{ state: CardState.NEW }, { state: CardState.LEARNING }];
      expect(calculateVariantProgressStatus(cards1)).toBe(ProgressStatus.IN_PROGRESS);

      const cards2 = [{ state: CardState.REVIEW }, { state: CardState.MASTERED }];
      expect(calculateVariantProgressStatus(cards2)).toBe(ProgressStatus.IN_PROGRESS);
    });

    it('returns MASTERED only when ALL cards are MASTERED', () => {
      const cards = [{ state: CardState.MASTERED }, { state: CardState.MASTERED }];
      expect(calculateVariantProgressStatus(cards)).toBe(ProgressStatus.MASTERED);
    });
  });

  describe('Variant Progress Percent Calculation', () => {
    it('returns 0 when totalCards is 0', () => {
      expect(calculateVariantProgressPercent(0, 0)).toBe(0);
    });

    it('calculates unweighted rounded percentage', () => {
      expect(calculateVariantProgressPercent(1, 4)).toBe(25);
      expect(calculateVariantProgressPercent(2, 4)).toBe(50);
      expect(calculateVariantProgressPercent(1, 3)).toBe(33);
      expect(calculateVariantProgressPercent(2, 3)).toBe(67);
      expect(calculateVariantProgressPercent(3, 3)).toBe(100);
    });
  });
});
