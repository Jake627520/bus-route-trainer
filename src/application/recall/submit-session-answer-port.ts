import { RecallMode, SessionStatus } from '@/domain/recall/recall-session';
import { CardState, LearningCard } from '@/domain/learning/learning-card';
import { RecallAttempt } from '@/domain/recall/recall-attempt';

export interface LockedRecallSessionData {
  readonly id: string;
  readonly driverId: string;
  readonly routeId: string;
  readonly targetVariantKey: string;
  readonly status: SessionStatus;
  readonly plannedCardIds: readonly string[];
  readonly currentPromptIndex: number;
  readonly currentPromptStartedAt: Date | null;
}

export interface CardEvaluationData {
  readonly card: LearningCard;
  readonly expectedAnswer: string;
  readonly defaultRecallMode: RecallMode;
}

export interface SubmitSessionAnswerTxContext {
  /**
   * Acquires row lock (SELECT ... FOR UPDATE) on RecallSession for sessionId.
   * Throws SessionNotFoundError if not found.
   */
  lockSession(sessionId: string): Promise<LockedRecallSessionData>;

  /**
   * Looks up existing RecallAttempt by unique (sessionId, promptIndex).
   */
  findAttempt(sessionId: string, promptIndex: number): Promise<RecallAttempt | null>;

  /**
   * Acquires row lock (SELECT ... FOR UPDATE) on LearningCard for cardId,
   * along with expected answer and default mode.
   */
  lockCardAndResolveTarget(cardId: string): Promise<CardEvaluationData | null>;

  /**
   * Persists RecallAttempt with verbatim submission and SRS resulting snapshot.
   */
  createAttempt(attempt: RecallAttempt): Promise<RecallAttempt>;

  /**
   * Updates LearningCard state, SRS level, repetitions, lapses, nextReviewAt.
   */
  updateCardSrs(params: {
    cardId: string;
    progressId: string;
    state: CardState;
    srsLevel: number;
    nextReviewAt: Date;
    repetitions: number;
    lapses: number;
    now: Date;
  }): Promise<void>;

  /**
   * Advances RecallSession cursor (or marks COMPLETED) and clears currentPromptStartedAt.
   */
  advanceSession(params: {
    sessionId: string;
    nextPromptIndex: number;
    isCompleted: boolean;
    completedAt?: Date;
  }): Promise<void>;
}

export interface SubmitSessionAnswerPort {
  /**
   * Executes work within a single atomic database transaction.
   */
  runInTransaction<T>(work: (ctx: SubmitSessionAnswerTxContext) => Promise<T>): Promise<T>;
}
