/**
 * Predicate to evaluate if a learning card is due for spaced review.
 * Invariant:
 * - card.nextReviewAt === null (e.g. NEW card) -> false
 * - card.nextReviewAt <= now -> true
 * - card.nextReviewAt > now -> false
 */
export function isCardDue(
  card: { nextReviewAt: Date | null },
  now: Date,
): boolean {
  if (!card.nextReviewAt) return false;
  return card.nextReviewAt.getTime() <= now.getTime();
}
