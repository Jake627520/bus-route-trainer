import { SessionStatus } from '@/domain/recall/recall-session';

export interface AbandonableRecallSessionData {
  readonly id: string;
  readonly driverId: string;
  readonly routeId: string;
  readonly targetVariantKey: string;
  readonly status: SessionStatus;
  readonly plannedCardIds: readonly string[];
  readonly currentPromptIndex: number;
  readonly currentPromptStartedAt: Date | null;
  readonly abandonedAt: Date | null;
}

export interface AbandonRecallSessionTxContext {
  /**
   * Acquires row lock (SELECT ... FOR UPDATE) on RecallSession for sessionId.
   * Throws SessionNotFoundError if not found.
   */
  lockSession(sessionId: string): Promise<AbandonableRecallSessionData>;

  /**
   * Updates session status to ABANDONED, sets abandonedAt, and clears currentPromptStartedAt.
   * Preserves currentPromptIndex as frozen.
   */
  markSessionAbandoned(params: {
    sessionId: string;
    abandonedAt: Date;
  }): Promise<void>;
}

export interface AbandonRecallSessionPort {
  /**
   * Executes work within a single atomic database transaction.
   */
  runInTransaction<T>(work: (ctx: AbandonRecallSessionTxContext) => Promise<T>): Promise<T>;
}
