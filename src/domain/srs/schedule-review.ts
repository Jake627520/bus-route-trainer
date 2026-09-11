import { CardState } from '@/domain/learning/learning-card';
import { ReviewResult } from '@/domain/learning/review-outcome';
import { SRS_INTERVAL_SECONDS, SrsLevel } from './srs-interval-policy';

export interface SrsSchedulableCard {
  readonly state: CardState;
  readonly srsLevel: SrsLevel;
  readonly repetitions: number;
  readonly lapses: number;
  readonly nextReviewAt: Date | null;
}

export interface SrsScheduleDecision {
  readonly nextState: CardState;
  readonly nextSrsLevel: SrsLevel;
  readonly nextReviewAt: Date;
  readonly nextRepetitions: number;
  readonly nextLapses: number;
}

/**
 * Pure, deterministic scheduler for Spaced Repetition System.
 *
 * Scheduling Invariants:
 * 1. 0 <= srsLevel <= 5
 * 2. srsLevel === 5 <=> state === MASTERED
 * 3. PASS progression:
 *    - NEW -> LEARNING (L1, 1d)
 *    - LEARNING -> REVIEW (L2, 3d)
 *    - REVIEW L0..L3 -> REVIEW L(current+1)
 *    - REVIEW L4 -> MASTERED (L5, 30d)
 *    - MASTERED L5 -> MASTERED (L5, 30d)
 *    - nextReviewAt = max(existingNextReviewAt, now + interval)
 * 4. FAIL progression (no max):
 *    - nextLevel = 0
 *    - nextReviewAt = now + 10m
 *    - (NEW | LEARNING) -> LEARNING (lapses unchanged)
 *    - (REVIEW | MASTERED) -> REVIEW (lapses + 1)
 * 5. Repetitions is monotonic non-decreasing lifetime volume (PASS -> +1, FAIL -> unchanged).
 */
export function scheduleReview(
  card: SrsSchedulableCard,
  result: ReviewResult,
  now: Date,
): SrsScheduleDecision {
  if (card.srsLevel < 0 || card.srsLevel > 5) {
    throw new Error('invalid srsLevel: must be between 0 and 5');
  }

  if (result === 'PASS') {
    const nextRepetitions = card.repetitions + 1;
    const nextLapses = card.lapses;

    let nextSrsLevel: SrsLevel;
    let nextState: CardState;

    if (card.state === CardState.NEW) {
      nextSrsLevel = 1;
      nextState = CardState.LEARNING;
    } else if (card.state === CardState.LEARNING) {
      nextSrsLevel = 2;
      nextState = CardState.REVIEW;
    } else {
      nextSrsLevel = Math.min(card.srsLevel + 1, 5) as SrsLevel;
      nextState = nextSrsLevel === 5 ? CardState.MASTERED : CardState.REVIEW;
    }

    const intervalSeconds = SRS_INTERVAL_SECONDS[nextSrsLevel];
    const targetDate = new Date(now.getTime() + intervalSeconds * 1000);

    // Defensive scheduling: Early reviews do not compress already scheduled future dates
    const nextReviewAt =
      card.nextReviewAt && card.nextReviewAt.getTime() > targetDate.getTime()
        ? new Date(card.nextReviewAt.getTime())
        : targetDate;

    return {
      nextState,
      nextSrsLevel,
      nextReviewAt,
      nextRepetitions,
      nextLapses,
    };
  } else {
    // FAIL resets srsLevel to 0 and schedules immediate wake-up (10 minutes)
    const nextSrsLevel: SrsLevel = 0;
    const nextRepetitions = card.repetitions;

    const isConsolidated =
      card.state === CardState.REVIEW || card.state === CardState.MASTERED;
    const nextLapses = isConsolidated ? card.lapses + 1 : card.lapses;
    const nextState = isConsolidated ? CardState.REVIEW : CardState.LEARNING;

    const intervalSeconds = SRS_INTERVAL_SECONDS[0];
    const nextReviewAt = new Date(now.getTime() + intervalSeconds * 1000);

    return {
      nextState,
      nextSrsLevel,
      nextReviewAt,
      nextRepetitions,
      nextLapses,
    };
  }
}
