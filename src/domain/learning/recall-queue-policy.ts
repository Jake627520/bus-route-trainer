import { CardState } from '@/domain/learning/learning-card';

export const DEFAULT_SESSION_SIZE = 15;
export const MAX_SESSION_SIZE = 20;
export const DEFAULT_DUE_RATIO = 0.7;

export interface RecallQueueCandidate {
  readonly cardId: string;
  readonly state: CardState;
  readonly nextReviewAt: Date | null;
}

export interface RecallQueuePolicyInput {
  readonly dueCards: readonly RecallQueueCandidate[];
  readonly newCards: readonly RecallQueueCandidate[];
  readonly now: Date;
  readonly sessionSize: number;
  readonly dueRatio?: number;
  readonly excludedCardIds?: ReadonlySet<string>;
}

export interface RecallQueuePolicyResult {
  readonly cardIds: readonly string[];
}

/**
 * Pure domain policy for selecting and ordering Recall Session candidates.
 *
 * Selection Rules:
 * 1. Clamps session size: 0 < sessionSize <= MAX_SESSION_SIZE (returns [] if <= 0).
 * 2. Excludes cards in `excludedCardIds` (session-level exclusion: prevents same-session re-selection; time cooldown is strictly managed by SRS layer via nextReviewAt).
 * 3. DUE pool criteria: nextReviewAt !== null && nextReviewAt <= now.
 *    Ordering: oldest nextReviewAt ASC (overdue duration DESC), tie-breaker cardId ASC.
 * 4. NEW pool criteria: state === NEW && nextReviewAt === null.
 *    Ordering: cardId ASC.
 * 5. Target mixing ratio (default 70% DUE, 30% NEW):
 *    dueTarget = Math.ceil(sessionSize * dueRatio).
 *    Asymmetric backfill: DUE deficit filled by NEW; NEW deficit filled by DUE.
 * 6. Deduplication invariant: zero duplicate card IDs in output.
 */
export function selectRecallQueue(
  input: RecallQueuePolicyInput,
): RecallQueuePolicyResult {
  if (input.sessionSize <= 0) {
    return { cardIds: [] };
  }

  const effectiveSessionSize = Math.min(input.sessionSize, MAX_SESSION_SIZE);
  const excluded = input.excludedCardIds ?? new Set<string>();

  // 1. Filter, deduplicate, and sort DUE pool
  const dueMap = new Map<string, RecallQueueCandidate>();
  for (const card of input.dueCards) {
    if (excluded.has(card.cardId)) continue;
    if (!card.nextReviewAt) continue;
    if (card.nextReviewAt.getTime() > input.now.getTime()) continue;
    if (!dueMap.has(card.cardId)) {
      dueMap.set(card.cardId, card);
    }
  }

  const sortedDue = Array.from(dueMap.values()).sort((a, b) => {
    const timeDiff = a.nextReviewAt!.getTime() - b.nextReviewAt!.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.cardId.localeCompare(b.cardId);
  });

  // 2. Filter, deduplicate, and sort NEW pool (also exclude cards already in DUE pool)
  const newMap = new Map<string, RecallQueueCandidate>();
  for (const card of input.newCards) {
    if (excluded.has(card.cardId)) continue;
    if (dueMap.has(card.cardId)) continue; // Cross-pool deduplication
    if (card.state !== CardState.NEW) continue;
    if (card.nextReviewAt !== null) continue;
    if (!newMap.has(card.cardId)) {
      newMap.set(card.cardId, card);
    }
  }

  const sortedNew = Array.from(newMap.values()).sort((a, b) =>
    a.cardId.localeCompare(b.cardId),
  );

  // 3. Mixing ratio & target calculations
  const ratio =
    input.dueRatio !== undefined && input.dueRatio >= 0 && input.dueRatio <= 1
      ? input.dueRatio
      : DEFAULT_DUE_RATIO;

  const dueTarget = Math.ceil(effectiveSessionSize * ratio);

  // 4. Asymmetric dynamic backfill
  const dueCount = Math.min(dueTarget, sortedDue.length);
  const remainingSlotsForNew = effectiveSessionSize - dueCount;
  const newCount = Math.min(remainingSlotsForNew, sortedNew.length);
  const remainingSlotsForDue = effectiveSessionSize - (dueCount + newCount);
  const additionalDue = Math.min(remainingSlotsForDue, sortedDue.length - dueCount);

  const selectedDue = sortedDue.slice(0, dueCount + additionalDue);
  const selectedNew = sortedNew.slice(0, newCount);

  const finalCardIds = [
    ...selectedDue.map((c) => c.cardId),
    ...selectedNew.map((c) => c.cardId),
  ];

  return {
    cardIds: Object.freeze(finalCardIds),
  };
}
