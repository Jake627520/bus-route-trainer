import { randomUUID } from 'crypto';
import { RecallOutcome, RecallMode, SessionStatus } from '@/domain/recall/recall-session';
import { CardState } from '@/domain/learning/learning-card';
import { Clock, SystemClock } from '@/application/common/clock';
import { DeterministicRecallEvaluator } from '@/domain/recall/deterministic-evaluator';
import { scheduleReview } from '@/domain/srs/schedule-review';
import { RecallAttempt } from '@/domain/recall/recall-attempt';
import { SubmitSessionAnswerPort } from './submit-session-answer-port';

export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Recall session '${sessionId}' was not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionOwnershipError extends Error {
  constructor(public readonly sessionId: string, public readonly driverId: string) {
    super(`Driver '${driverId}' is not the owner of session '${sessionId}'`);
    this.name = 'SessionOwnershipError';
  }
}

export class SessionNotActiveError extends Error {
  constructor(public readonly sessionId: string, public readonly status: string) {
    super(`Recall session '${sessionId}' is not active (status: ${status})`);
    this.name = 'SessionNotActiveError';
  }
}

export class PromptIndexMismatchError extends Error {
  constructor(public readonly promptIndex: number, public readonly currentPromptIndex: number) {
    super(
      `Submitted promptIndex (${promptIndex}) does not match session currentPromptIndex (${currentPromptIndex})`,
    );
    this.name = 'PromptIndexMismatchError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor(public readonly sessionId: string, public readonly promptIndex: number) {
    super(
      `Prompt ${promptIndex} in session ${sessionId} was already submitted with different input or recallMode`,
    );
    this.name = 'IdempotencyConflictError';
  }
}

export interface SubmitSessionAnswerCommand {
  readonly sessionId: string;
  readonly promptIndex: number;
  readonly rawInput: string;
  readonly recallMode?: RecallMode;
  readonly driverId: string;
}

export interface SubmitSessionAnswerResult {
  readonly outcome: RecallOutcome;
  readonly promptIndex: number;
  readonly isSessionCompleted: boolean;
  readonly resultingState: CardState;
  readonly resultingSrsLevel: number;
  readonly isDuplicate: boolean;
}

export class SubmitSessionAnswerUseCase {
  private readonly evaluator: DeterministicRecallEvaluator;

  constructor(
    private readonly port: SubmitSessionAnswerPort,
    private readonly clock: Clock = new SystemClock(),
  ) {
    this.evaluator = new DeterministicRecallEvaluator();
  }

  async execute(command: SubmitSessionAnswerCommand): Promise<SubmitSessionAnswerResult> {
    const authoritativeNow = this.clock.now();

    return await this.port.runInTransaction(async (ctx) => {
      // 1. RecallSession FOR UPDATE
      const session = await ctx.lockSession(command.sessionId);

      // 2. Validate session ownership
      if (session.driverId !== command.driverId) {
        throw new SessionOwnershipError(command.sessionId, command.driverId);
      }

      // 3. Attempt lookup (sessionId, promptIndex) BEFORE lifecycle checks (Attempt Precedence)
      const existingAttempt = await ctx.findAttempt(command.sessionId, command.promptIndex);

      if (existingAttempt) {
        // Idempotency check: Exact verbatim comparison
        const modeMatches = !command.recallMode || existingAttempt.recallMode === command.recallMode;
        if (existingAttempt.rawInput === command.rawInput && modeMatches) {
          // Exactly identical submission -> REPLAY persisted snapshot (Zero LearningCard locks, zero SRS re-execution)
          return {
            outcome: existingAttempt.outcome,
            promptIndex: existingAttempt.promptIndex,
            isSessionCompleted: session.status === SessionStatus.COMPLETED,
            resultingState: existingAttempt.resultingState,
            resultingSrsLevel: existingAttempt.resultingSrsLevel,
            isDuplicate: true,
          };
        } else {
          // Divergent submission identity -> ROLLBACK and throw IdempotencyConflictError
          throw new IdempotencyConflictError(command.sessionId, command.promptIndex);
        }
      }

      // 4. Attempt does NOT exist: validate lifecycle & cursor alignment
      if (session.status !== SessionStatus.IN_PROGRESS) {
        throw new SessionNotActiveError(command.sessionId, session.status);
      }

      if (command.promptIndex !== session.currentPromptIndex) {
        throw new PromptIndexMismatchError(command.promptIndex, session.currentPromptIndex);
      }

      if (
        session.currentPromptIndex < 0 ||
        session.currentPromptIndex >= session.plannedCardIds.length
      ) {
        throw new Error(
          `Invalid currentPromptIndex (${session.currentPromptIndex}) for session ${session.id}`,
        );
      }

      // 5. Lock LearningCard FOR UPDATE
      const targetCardId = session.plannedCardIds[session.currentPromptIndex];
      const targetData = await ctx.lockCardAndResolveTarget(targetCardId);
      if (!targetData) {
        throw new Error(
          `LearningCard '${targetCardId}' not found for prompt index ${session.currentPromptIndex}`,
        );
      }

      const { card, expectedAnswer, defaultRecallMode } = targetData;
      const effectiveMode = command.recallMode ?? defaultRecallMode;

      // 6. Evaluate answer
      const outcome = this.evaluator.evaluate(effectiveMode, command.rawInput, expectedAnswer);

      // 7. Execute pure domain SRS scheduler
      const decision = scheduleReview(
        {
          state: card.state,
          srsLevel: card.srsLevel,
          repetitions: card.repetitions,
          lapses: card.lapses,
          nextReviewAt: card.nextReviewAt,
        },
        outcome as 'PASS' | 'FAIL',
        authoritativeNow,
      );

      // 8. StartedAt & duration
      const startedAt = session.currentPromptStartedAt ?? authoritativeNow;
      const durationMs = Math.max(0, authoritativeNow.getTime() - startedAt.getTime());

      // 9. Insert RecallAttempt with resulting snapshot
      const attempt = new RecallAttempt({
        id: randomUUID(),
        sessionId: session.id,
        promptIndex: session.currentPromptIndex,
        cardKey: card.cardKey,
        recallMode: effectiveMode,
        rawInput: command.rawInput,
        expectedAnswer,
        outcome,
        startedAt,
        answeredAt: authoritativeNow,
        durationMs,
        resultingState: decision.nextState,
        resultingSrsLevel: decision.nextSrsLevel,
        resultingNextReviewAt: decision.nextReviewAt,
        resultingRepetitions: decision.nextRepetitions,
        resultingLapses: decision.nextLapses,
      });
      await ctx.createAttempt(attempt);

      // 10. Update LearningCard in tx
      await ctx.updateCardSrs({
        cardId: card.id,
        progressId: card.progressId,
        state: decision.nextState,
        srsLevel: decision.nextSrsLevel,
        nextReviewAt: decision.nextReviewAt,
        repetitions: decision.nextRepetitions,
        lapses: decision.nextLapses,
        now: authoritativeNow,
      });

      // 11. Advance RecallSession cursor and clear currentPromptStartedAt
      const isLastPrompt = session.currentPromptIndex === session.plannedCardIds.length - 1;
      const nextPromptIndex = session.currentPromptIndex + 1;

      await ctx.advanceSession({
        sessionId: session.id,
        nextPromptIndex,
        isCompleted: isLastPrompt,
        completedAt: isLastPrompt ? authoritativeNow : undefined,
      });

      return {
        outcome,
        promptIndex: session.currentPromptIndex,
        isSessionCompleted: isLastPrompt,
        resultingState: decision.nextState,
        resultingSrsLevel: decision.nextSrsLevel,
        isDuplicate: false,
      };
    });
  }
}
