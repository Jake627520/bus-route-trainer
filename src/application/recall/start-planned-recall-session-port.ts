import { RecallSession } from '@/domain/recall/recall-session';
import { RecallQueueCandidate } from '@/domain/learning/recall-queue-policy';

export interface StartPlannedSessionTxContext {
  /**
   * Acquires row lock (SELECT ... FOR UPDATE) on DriverVariantProgress for driverId and variantKey.
   * Throws DriverNotEnrolledError if progress record is not found.
   */
  lockDriverVariantProgress(driverId: string, variantKey: string): Promise<{ progressId: string }>;

  /**
   * Checks for an active (IN_PROGRESS) RecallSession for driverId and variantKey.
   */
  findActiveSession(driverId: string, variantKey: string): Promise<RecallSession | null>;

  /**
   * Queries candidates for due cards and new cards inside the transaction.
   */
  queryCandidates(progressId: string, now: Date): Promise<{
    dueCandidates: readonly RecallQueueCandidate[];
    newCandidates: readonly RecallQueueCandidate[];
  }>;

  /**
   * Inserts the new RecallSession inside the transaction.
   */
  createSession(session: RecallSession): Promise<RecallSession>;
}

export interface StartPlannedRecallSessionPort {
  /**
   * Runs the provided work within an atomic transaction.
   */
  runInTransaction<T>(work: (ctx: StartPlannedSessionTxContext) => Promise<T>): Promise<T>;
}
