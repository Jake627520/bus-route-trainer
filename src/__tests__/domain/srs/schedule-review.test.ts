import { describe, it, expect } from 'vitest';
import { CardState } from '@/domain/learning/learning-card';
import { SRS_INTERVAL_SECONDS, SrsLevel } from '@/domain/srs/srs-interval-policy';
import { scheduleReview, SrsSchedulableCard } from '@/domain/srs/schedule-review';
import { isCardDue } from '@/domain/srs/is-card-due';

describe('SRS Scheduling Engine (Domain Unit Tests)', () => {
  const BASE_NOW = new Date('2026-09-11T10:00:00.000Z');

  describe('1. SRS Interval Policy Constant Ladder', () => {
    it('defines exact deterministic second intervals for Levels 0..5', () => {
      expect(SRS_INTERVAL_SECONDS[0]).toBe(10 * 60); // 600s (10m)
      expect(SRS_INTERVAL_SECONDS[1]).toBe(1 * 24 * 60 * 60); // 86400s (1d)
      expect(SRS_INTERVAL_SECONDS[2]).toBe(3 * 24 * 60 * 60); // 259200s (3d)
      expect(SRS_INTERVAL_SECONDS[3]).toBe(7 * 24 * 60 * 60); // 604800s (7d)
      expect(SRS_INTERVAL_SECONDS[4]).toBe(14 * 24 * 60 * 60); // 1209600s (14d)
      expect(SRS_INTERVAL_SECONDS[5]).toBe(30 * 24 * 60 * 60); // 2592000s (30d)
    });
  });

  describe('2. 8 Primary CardState × Outcome Combinations', () => {
    // 1. NEW + PASS -> LEARNING, L1, now + 1d
    it('(1) NEW + PASS promotes to LEARNING, Level 1 (1 day), reps+1, lapses unchanged', () => {
      const card: SrsSchedulableCard = {
        state: CardState.NEW,
        srsLevel: 0,
        repetitions: 0,
        lapses: 0,
        nextReviewAt: null,
      };

      const result = scheduleReview(card, 'PASS', BASE_NOW);

      expect(result.nextState).toBe(CardState.LEARNING);
      expect(result.nextSrsLevel).toBe(1);
      expect(result.nextReviewAt.toISOString()).toBe('2026-09-12T10:00:00.000Z'); // now + 1d
      expect(result.nextRepetitions).toBe(1);
      expect(result.nextLapses).toBe(0);
    });

    // 2. NEW + FAIL -> LEARNING, L0, now + 10m
    it('(2) NEW + FAIL transitions to LEARNING, Level 0 (10 mins), reps unchanged, lapses unchanged', () => {
      const card: SrsSchedulableCard = {
        state: CardState.NEW,
        srsLevel: 0,
        repetitions: 0,
        lapses: 0,
        nextReviewAt: null,
      };

      const result = scheduleReview(card, 'FAIL', BASE_NOW);

      expect(result.nextState).toBe(CardState.LEARNING);
      expect(result.nextSrsLevel).toBe(0);
      expect(result.nextReviewAt.toISOString()).toBe('2026-09-11T10:10:00.000Z'); // now + 10m
      expect(result.nextRepetitions).toBe(0);
      expect(result.nextLapses).toBe(0);
    });

    // 3. LEARNING + PASS -> REVIEW, L2, now + 3d
    it('(3) LEARNING + PASS promotes to REVIEW, Level 2 (3 days), reps+1, lapses unchanged', () => {
      const card: SrsSchedulableCard = {
        state: CardState.LEARNING,
        srsLevel: 1,
        repetitions: 1,
        lapses: 0,
        nextReviewAt: new Date('2026-09-11T09:00:00.000Z'), // already due
      };

      const result = scheduleReview(card, 'PASS', BASE_NOW);

      expect(result.nextState).toBe(CardState.REVIEW);
      expect(result.nextSrsLevel).toBe(2);
      expect(result.nextReviewAt.toISOString()).toBe('2026-09-14T10:00:00.000Z'); // now + 3d
      expect(result.nextRepetitions).toBe(2);
      expect(result.nextLapses).toBe(0);
    });

    // 4. LEARNING + FAIL -> LEARNING, L0, now + 10m
    it('(4) LEARNING + FAIL remains LEARNING, Level 0 (10 mins), reps unchanged, lapses unchanged', () => {
      const card: SrsSchedulableCard = {
        state: CardState.LEARNING,
        srsLevel: 1,
        repetitions: 1,
        lapses: 0,
        nextReviewAt: new Date('2026-09-11T09:00:00.000Z'),
      };

      const result = scheduleReview(card, 'FAIL', BASE_NOW);

      expect(result.nextState).toBe(CardState.LEARNING);
      expect(result.nextSrsLevel).toBe(0);
      expect(result.nextReviewAt.toISOString()).toBe('2026-09-11T10:10:00.000Z'); // now + 10m
      expect(result.nextRepetitions).toBe(1);
      expect(result.nextLapses).toBe(0);
    });

    // 5. REVIEW + PASS (L2 -> L3) -> REVIEW, L3, now + 7d
    it('(5) REVIEW + PASS advances level (L2 -> L3, 7 days), reps+1, lapses unchanged', () => {
      const card: SrsSchedulableCard = {
        state: CardState.REVIEW,
        srsLevel: 2,
        repetitions: 2,
        lapses: 0,
        nextReviewAt: new Date('2026-09-11T09:00:00.000Z'),
      };

      const result = scheduleReview(card, 'PASS', BASE_NOW);

      expect(result.nextState).toBe(CardState.REVIEW);
      expect(result.nextSrsLevel).toBe(3);
      expect(result.nextReviewAt.toISOString()).toBe('2026-09-18T10:00:00.000Z'); // now + 7d
      expect(result.nextRepetitions).toBe(3);
      expect(result.nextLapses).toBe(0);
    });

    // 6. REVIEW + FAIL -> REVIEW, L0, now + 10m, lapses+1
    it('(6) REVIEW + FAIL remains REVIEW, resets to Level 0 (10 mins), reps unchanged, lapses+1', () => {
      const card: SrsSchedulableCard = {
        state: CardState.REVIEW,
        srsLevel: 3,
        repetitions: 3,
        lapses: 0,
        nextReviewAt: new Date('2026-09-11T09:00:00.000Z'),
      };

      const result = scheduleReview(card, 'FAIL', BASE_NOW);

      expect(result.nextState).toBe(CardState.REVIEW);
      expect(result.nextSrsLevel).toBe(0);
      expect(result.nextReviewAt.toISOString()).toBe('2026-09-11T10:10:00.000Z'); // now + 10m
      expect(result.nextRepetitions).toBe(3);
      expect(result.nextLapses).toBe(1);
    });

    // 7. MASTERED + PASS -> MASTERED, L5, now + 30d
    it('(7) MASTERED + PASS retains MASTERED at capped Level 5 (30 days), reps+1, lapses unchanged', () => {
      const card: SrsSchedulableCard = {
        state: CardState.MASTERED,
        srsLevel: 5,
        repetitions: 10,
        lapses: 1,
        nextReviewAt: new Date('2026-09-11T09:00:00.000Z'),
      };

      const result = scheduleReview(card, 'PASS', BASE_NOW);

      expect(result.nextState).toBe(CardState.MASTERED);
      expect(result.nextSrsLevel).toBe(5);
      expect(result.nextReviewAt.toISOString()).toBe('2026-10-11T10:00:00.000Z'); // now + 30d
      expect(result.nextRepetitions).toBe(11);
      expect(result.nextLapses).toBe(1);
    });

    // 8. MASTERED + FAIL -> REVIEW, L0, now + 10m, lapses+1
    it('(8) MASTERED + FAIL slips to REVIEW, resets to Level 0 (10 mins), reps unchanged, lapses+1', () => {
      const card: SrsSchedulableCard = {
        state: CardState.MASTERED,
        srsLevel: 5,
        repetitions: 10,
        lapses: 1,
        nextReviewAt: new Date('2026-09-11T09:00:00.000Z'),
      };

      const result = scheduleReview(card, 'FAIL', BASE_NOW);

      expect(result.nextState).toBe(CardState.REVIEW);
      expect(result.nextSrsLevel).toBe(0);
      expect(result.nextReviewAt.toISOString()).toBe('2026-09-11T10:10:00.000Z'); // now + 10m
      expect(result.nextRepetitions).toBe(10);
      expect(result.nextLapses).toBe(2);
    });
  });

  describe('3. Level 4 Progression to Mastered', () => {
    it('REVIEW at Level 4 + PASS promotes directly to MASTERED at Level 5 (30 days)', () => {
      const card: SrsSchedulableCard = {
        state: CardState.REVIEW,
        srsLevel: 4,
        repetitions: 4,
        lapses: 0,
        nextReviewAt: new Date('2026-09-11T09:00:00.000Z'),
      };

      const result = scheduleReview(card, 'PASS', BASE_NOW);

      expect(result.nextState).toBe(CardState.MASTERED);
      expect(result.nextSrsLevel).toBe(5);
      expect(result.nextReviewAt.toISOString()).toBe('2026-10-11T10:00:00.000Z'); // now + 30d
      expect(result.nextRepetitions).toBe(5);
      expect(result.nextLapses).toBe(0);
    });
  });

  describe('4. 4 Mandated Named Test Suites', () => {
    it('Named Suite 1 (Lapse recovery): REVIEW/L4 + FAIL -> REVIEW/L0/10m, then REVIEW/L0 + PASS -> REVIEW/L1/1d', () => {
      const lapsedCard: SrsSchedulableCard = {
        state: CardState.REVIEW,
        srsLevel: 4,
        repetitions: 5,
        lapses: 0,
        nextReviewAt: new Date('2026-09-11T09:00:00.000Z'),
      };

      // Step 1: FAIL
      const failStep = scheduleReview(lapsedCard, 'FAIL', BASE_NOW);
      expect(failStep.nextState).toBe(CardState.REVIEW);
      expect(failStep.nextSrsLevel).toBe(0);
      expect(failStep.nextReviewAt.toISOString()).toBe('2026-09-11T10:10:00.000Z');
      expect(failStep.nextRepetitions).toBe(5);
      expect(failStep.nextLapses).toBe(1);

      // Step 2: 10 minutes later, driver passes
      const reviewNow = new Date('2026-09-11T10:10:00.000Z');
      const cardAtReview: SrsSchedulableCard = {
        state: failStep.nextState,
        srsLevel: failStep.nextSrsLevel,
        repetitions: failStep.nextRepetitions,
        lapses: failStep.nextLapses,
        nextReviewAt: failStep.nextReviewAt,
      };

      const passStep = scheduleReview(cardAtReview, 'PASS', reviewNow);
      expect(passStep.nextState).toBe(CardState.REVIEW);
      expect(passStep.nextSrsLevel).toBe(1);
      expect(passStep.nextReviewAt.toISOString()).toBe('2026-09-12T10:10:00.000Z'); // reviewNow + 1d
      expect(passStep.nextRepetitions).toBe(6);
      expect(passStep.nextLapses).toBe(1);
    });

    it('Named Suite 2 (MASTERED recovery): MASTERED/L5 + FAIL -> REVIEW/L0/10m, then REVIEW/L0 + PASS -> REVIEW/L1/1d', () => {
      const masteredCard: SrsSchedulableCard = {
        state: CardState.MASTERED,
        srsLevel: 5,
        repetitions: 12,
        lapses: 1,
        nextReviewAt: new Date('2026-09-11T09:00:00.000Z'),
      };

      // Step 1: FAIL slips to REVIEW L0
      const failStep = scheduleReview(masteredCard, 'FAIL', BASE_NOW);
      expect(failStep.nextState).toBe(CardState.REVIEW);
      expect(failStep.nextSrsLevel).toBe(0);
      expect(failStep.nextReviewAt.toISOString()).toBe('2026-09-11T10:10:00.000Z');
      expect(failStep.nextLapses).toBe(2);

      // Step 2: PASS after 10m advances to REVIEW L1
      const reviewNow = new Date('2026-09-11T10:10:00.000Z');
      const passStep = scheduleReview(
        {
          state: failStep.nextState,
          srsLevel: failStep.nextSrsLevel,
          repetitions: failStep.nextRepetitions,
          lapses: failStep.nextLapses,
          nextReviewAt: failStep.nextReviewAt,
        },
        'PASS',
        reviewNow,
      );

      expect(passStep.nextState).toBe(CardState.REVIEW);
      expect(passStep.nextSrsLevel).toBe(1);
      expect(passStep.nextReviewAt.toISOString()).toBe('2026-09-12T10:10:00.000Z');
      expect(passStep.nextRepetitions).toBe(13);
      expect(passStep.nextLapses).toBe(2);
    });

    it('Named Suite 3 (Overdue PASS): existing = now - 10d, now = T, interval = 7d -> expected = T + 7d (anchored to now)', () => {
      const overdueCard: SrsSchedulableCard = {
        state: CardState.REVIEW,
        srsLevel: 2, // will advance to L3 (7d)
        repetitions: 3,
        lapses: 0,
        nextReviewAt: new Date('2026-09-01T10:00:00.000Z'), // 10 days overdue relative to BASE_NOW (9/11)
      };

      const result = scheduleReview(overdueCard, 'PASS', BASE_NOW);

      expect(result.nextSrsLevel).toBe(3);
      // Expected = BASE_NOW (2026-09-11) + 7 days = 2026-09-18, NEVER 2026-09-01 + 7d
      expect(result.nextReviewAt.toISOString()).toBe('2026-09-18T10:00:00.000Z');
    });

    it('Named Suite 4 (Early PASS): target < existing retains existing; target > existing extends to target', () => {
      // Case 4A: Early PASS where targetDate is earlier than existingNextReviewAt
      // existing is 5 days in future (9/16), targetDate is now + 1d (9/12) -> should retain 9/16
      const earlyCardA: SrsSchedulableCard = {
        state: CardState.REVIEW,
        srsLevel: 0, // next level 1 (1d)
        repetitions: 4,
        lapses: 1,
        nextReviewAt: new Date('2026-09-16T10:00:00.000Z'), // now + 5d
      };

      const resultA = scheduleReview(earlyCardA, 'PASS', BASE_NOW);
      expect(resultA.nextSrsLevel).toBe(1);
      // max(2026-09-16, 2026-09-12) = 2026-09-16
      expect(resultA.nextReviewAt.toISOString()).toBe('2026-09-16T10:00:00.000Z');

      // Case 4B: Early PASS where targetDate is later than existingNextReviewAt
      // existing is 5 days in future (9/16), targetDate is now + 7d (9/18) -> should extend to 9/18
      const earlyCardB: SrsSchedulableCard = {
        state: CardState.REVIEW,
        srsLevel: 2, // next level 3 (7d)
        repetitions: 4,
        lapses: 0,
        nextReviewAt: new Date('2026-09-16T10:00:00.000Z'), // now + 5d
      };

      const resultB = scheduleReview(earlyCardB, 'PASS', BASE_NOW);
      expect(resultB.nextSrsLevel).toBe(3);
      // max(2026-09-16, 2026-09-18) = 2026-09-18
      expect(resultB.nextReviewAt.toISOString()).toBe('2026-09-18T10:00:00.000Z');
    });
  });

  describe('5. FAIL Strictly Forbids max() (Immediate Wake-up)', () => {
    it('forces now + 10m even if existingNextReviewAt was scheduled 20 days in the future', () => {
      const futureCard: SrsSchedulableCard = {
        state: CardState.REVIEW,
        srsLevel: 4,
        repetitions: 8,
        lapses: 0,
        nextReviewAt: new Date('2026-10-01T10:00:00.000Z'), // 20 days in future
      };

      const result = scheduleReview(futureCard, 'FAIL', BASE_NOW);

      // Must be BASE_NOW + 10m (2026-09-11T10:10:00.000Z), NOT 2026-10-01
      expect(result.nextReviewAt.toISOString()).toBe('2026-09-11T10:10:00.000Z');
      expect(result.nextSrsLevel).toBe(0);
      expect(result.nextState).toBe(CardState.REVIEW);
    });
  });

  describe('6. Due Predicate & Exact Boundary Semantics', () => {
    it('evaluates exact millisecond boundaries correctly', () => {
      const now = new Date('2026-09-11T10:00:00.000Z');

      // NEW card with null nextReviewAt -> never due
      expect(isCardDue({ nextReviewAt: null }, now)).toBe(false);

      // Exact boundary: nextReviewAt === now -> due (true)
      expect(isCardDue({ nextReviewAt: new Date('2026-09-11T10:00:00.000Z') }, now)).toBe(true);

      // 1 millisecond past: nextReviewAt === now - 1ms -> due (true)
      expect(isCardDue({ nextReviewAt: new Date('2026-09-11T09:59:59.999Z') }, now)).toBe(true);

      // 1 millisecond future: nextReviewAt === now + 1ms -> not due (false)
      expect(isCardDue({ nextReviewAt: new Date('2026-09-11T10:00:00.001Z') }, now)).toBe(false);

      // Substantial future: nextReviewAt = now + 1 hour -> not due (false)
      expect(isCardDue({ nextReviewAt: new Date('2026-09-11T11:00:00.000Z') }, now)).toBe(false);
    });
  });

  describe('7. Invariant Checks & Input Validation', () => {
    it('throws error if card srsLevel is out of bounds (< 0 or > 5)', () => {
      expect(() =>
        scheduleReview(
          {
            state: CardState.REVIEW,
            srsLevel: -1 as SrsLevel,
            repetitions: 0,
            lapses: 0,
            nextReviewAt: null,
          },
          'PASS',
          BASE_NOW,
        ),
      ).toThrow('invalid srsLevel: must be between 0 and 5');

      expect(() =>
        scheduleReview(
          {
            state: CardState.REVIEW,
            srsLevel: 6 as unknown as SrsLevel,
            repetitions: 0,
            lapses: 0,
            nextReviewAt: null,
          },
          'PASS',
          BASE_NOW,
        ),
      ).toThrow('invalid srsLevel: must be between 0 and 5');
    });

    it('enforces bidirectional invariant: MASTERED <=> srsLevel === 5', () => {
      const result = scheduleReview(
        {
          state: CardState.REVIEW,
          srsLevel: 4,
          repetitions: 4,
          lapses: 0,
          nextReviewAt: BASE_NOW,
        },
        'PASS',
        BASE_NOW,
      );

      expect(result.nextState === CardState.MASTERED).toBe(true);
      expect(result.nextSrsLevel === 5).toBe(true);
    });

    it('confirms repetitions is decoupled from srsLevel (high reps with L0 after lapse is valid)', () => {
      const highlyExperiencedLapsedCard: SrsSchedulableCard = {
        state: CardState.REVIEW,
        srsLevel: 0,
        repetitions: 25,
        lapses: 4,
        nextReviewAt: BASE_NOW,
      };

      const result = scheduleReview(highlyExperiencedLapsedCard, 'PASS', BASE_NOW);

      expect(result.nextRepetitions).toBe(26);
      expect(result.nextSrsLevel).toBe(1);
      expect(result.nextState).toBe(CardState.REVIEW);
    });
  });
});
