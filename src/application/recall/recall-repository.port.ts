import { RecallSession } from '../../domain/recall/recall-session';
import { RecallAttempt } from '../../domain/recall/recall-attempt';

export interface RecallRepository {
  /**
   * Finds the currently active (IN_PROGRESS) session for a specific driver and variant.
   * Returns null if no active session exists.
   */
  findActiveSession(driverId: string, variantKey: string): Promise<RecallSession | null>;

  /**
   * Finds a recall session by its unique ID regardless of its status.
   */
  findById(sessionId: string): Promise<RecallSession | null>;

  /**
   * Finds a specific attempt within a session by promptIndex.
   * Used as an idempotency anchor to prevent duplicate submissions.
   */
  findAttemptBySessionAndIndex(
    sessionId: string,
    promptIndex: number,
  ): Promise<RecallAttempt | null>;

  /**
   * Retrieves all attempts for a given session, ordered by promptIndex ASC.
   */
  findAttemptsBySessionId(sessionId: string): Promise<RecallAttempt[]>;

  /**
   * Persists a new RecallSession along with its initial prompt snapshot.
   */
  createSession(session: RecallSession): Promise<RecallSession>;

  /**
   * Atomically records a RecallAttempt and advances the RecallSession's cursor
   * and prompt snapshot (or completes the session) within a single DB transaction.
   */
  saveAttemptAndAdvanceSession(
    attempt: RecallAttempt,
    updatedSession: RecallSession,
  ): Promise<{ attempt: RecallAttempt; session: RecallSession }>;

  /**
   * Updates a session's terminal status (COMPLETED or ABANDONED) and completion timestamp.
   */
  updateSessionStatus(session: RecallSession): Promise<RecallSession>;
}
