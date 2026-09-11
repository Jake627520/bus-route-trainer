export type ReviewResult = 'PASS' | 'FAIL';

/**
 * Minimal source type for Change 06.
 * Future assessment modes (QUIZ, LISTENING, etc.) will be added in future changes.
 */
export type ReviewSourceType = 'RECALL';

export interface ReviewOutcome {
  readonly sourceType: ReviewSourceType;
  readonly sourceAttemptId: string;
  readonly driverId: string;
  readonly targetVariantKey: string;
  readonly cardKey: string;
  readonly result: ReviewResult;
  readonly evaluatedAt: Date;
  readonly durationMs?: number;
}
