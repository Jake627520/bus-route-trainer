import { CardState } from './learning-card';
import { ProgressStatus } from './driver-variant-progress';
import { ReviewResult } from './review-outcome';

/**
 * Evaluates pure state transition: NextState = f(CurrentState, ReviewResult).
 * Invariant: CardState is never derived from repetitions >= N.
 *
 * Matrix:
 * - NEW + PASS      -> LEARNING
 * - NEW + FAIL      -> LEARNING
 * - LEARNING + PASS -> REVIEW
 * - LEARNING + FAIL -> LEARNING
 * - REVIEW + PASS   -> MASTERED
 * - REVIEW + FAIL   -> LEARNING
 * - MASTERED + PASS -> MASTERED
 * - MASTERED + FAIL -> REVIEW
 */
export function evaluateCardTransition(
  currentState: CardState,
  result: ReviewResult,
): CardState {
  if (result === 'PASS') {
    switch (currentState) {
      case CardState.NEW:
        return CardState.LEARNING;
      case CardState.LEARNING:
        return CardState.REVIEW;
      case CardState.REVIEW:
        return CardState.MASTERED;
      case CardState.MASTERED:
        return CardState.MASTERED;
    }
  } else {
    switch (currentState) {
      case CardState.NEW:
        return CardState.LEARNING;
      case CardState.LEARNING:
        return CardState.LEARNING;
      case CardState.REVIEW:
        return CardState.LEARNING;
      case CardState.MASTERED:
        return CardState.REVIEW;
    }
  }
}

/**
 * Cumulative successful retrievals.
 * - PASS -> +1
 * - FAIL -> unchanged
 * Never resets to 0. Monotonically non-decreasing.
 */
export function calculateNextRepetitions(
  currentRepetitions: number,
  result: ReviewResult,
): number {
  return result === 'PASS' ? currentRepetitions + 1 : currentRepetitions;
}

/**
 * Post-consolidation failure count.
 * - REVIEW + FAIL   -> +1
 * - MASTERED + FAIL -> +1
 * - NEW + FAIL      -> +0
 * - LEARNING + FAIL -> +0
 * - Any PASS        -> +0
 * Monotonically non-decreasing (lapses >= 0).
 */
export function calculateNextLapses(
  currentLapses: number,
  currentState: CardState,
  result: ReviewResult,
): number {
  if (result === 'FAIL') {
    if (currentState === CardState.REVIEW || currentState === CardState.MASTERED) {
      return currentLapses + 1;
    }
  }
  return currentLapses;
}

/**
 * Pure calculation of DriverVariantProgress status based on all cards:
 * - NOT_STARTED: all cards NEW (or 0 cards)
 * - MASTERED: all cards MASTERED (and cards > 0)
 * - IN_PROGRESS: any card moved past NEW, but not all MASTERED
 */
export function calculateVariantProgressStatus(
  cards: ReadonlyArray<{ state: CardState }>,
): ProgressStatus {
  if (cards.length === 0) {
    return ProgressStatus.NOT_STARTED;
  }

  const allNew = cards.every((c) => c.state === CardState.NEW);
  if (allNew) {
    return ProgressStatus.NOT_STARTED;
  }

  const allMastered = cards.every((c) => c.state === CardState.MASTERED);
  if (allMastered) {
    return ProgressStatus.MASTERED;
  }

  return ProgressStatus.IN_PROGRESS;
}

/**
 * Unweighted derived mastery percentage:
 * Math.round((masteredCount / totalCount) * 100)
 */
export function calculateVariantProgressPercent(
  masteredCount: number,
  totalCount: number,
): number {
  if (totalCount <= 0) return 0;
  return Math.round((masteredCount / totalCount) * 100);
}
