import { CardType } from '@/domain/learning/learning-card';
import { SessionStatus } from '@/domain/recall/recall-session';

export interface LockedSessionData {
  readonly id: string;
  readonly driverId: string;
  readonly routeId: string;
  readonly targetVariantKey: string;
  readonly status: SessionStatus;
  readonly plannedCardIds: readonly string[];
  readonly currentPromptIndex: number;
  readonly currentPromptStartedAt: Date | null;
}

export interface PromptCardData {
  readonly id: string;
  readonly cardKey: string;
  readonly cardType: CardType;
}

export interface GetCurrentSessionPromptTxContext {
  /**
   * Acquires row lock (SELECT ... FOR UPDATE) on RecallSession for sessionId.
   * Throws SessionNotFoundError if not found.
   */
  lockSession(sessionId: string): Promise<LockedSessionData>;

  /**
   * Updates currentPromptStartedAt in the DB for the locked session if not already set.
   */
  updatePromptStartedAt(sessionId: string, startedAt: Date): Promise<void>;

  /**
   * Fetches LearningCard and optional stop name for dynamic prompt construction.
   */
  getCardDetails(cardId: string): Promise<{
    card: PromptCardData;
    stopName?: string | null;
  } | null>;
}

export interface GetCurrentSessionPromptPort {
  /**
   * Runs the provided work within an atomic transaction.
   */
  runInTransaction<T>(work: (ctx: GetCurrentSessionPromptTxContext) => Promise<T>): Promise<T>;
}
