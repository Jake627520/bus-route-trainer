import { randomUUID } from 'crypto';
import { RecallRepository } from './recall-repository.port';
import { LearningProgressRepository } from '../learning/learning-progress-repository.port';
import { GetRouteVariantsUseCase } from '../gtfs/get-route-variants-use-case';
import {
  PromptSelectionStrategy,
  SequentialTopologyPromptStrategy,
} from '../../domain/recall/prompt-selection-strategy';
import { DeterministicRecallEvaluator } from '../../domain/recall/deterministic-evaluator';
import {
  SessionStatus,
  RecallOutcome,
  RecallSession,
} from '../../domain/recall/recall-session';
import { RecallAttempt } from '../../domain/recall/recall-attempt';
import {
  SessionNotFoundError,
  SessionNotActiveError,
} from './get-current-recall-prompt-use-case';
import { DEFAULT_DRIVER_ID } from '../learning/auth-constants';

export class PromptIndexMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptIndexMismatchError';
  }
}

export interface SubmitRecallAnswerCommand {
  sessionId: string;
  promptIndex: number;
  rawInput: string;
  driverId?: string;
}

export interface SubmitRecallAnswerResult {
  outcome: RecallOutcome;
  promptIndex: number;
  isSessionCompleted: boolean;
}

export class SubmitRecallAnswerUseCase {
  private readonly evaluator: DeterministicRecallEvaluator;

  constructor(
    private readonly recallRepo: RecallRepository,
    private readonly learningRepo: LearningProgressRepository,
    private readonly getRouteVariantsUseCase: GetRouteVariantsUseCase,
    private readonly promptStrategy: PromptSelectionStrategy = new SequentialTopologyPromptStrategy(),
  ) {
    this.evaluator = new DeterministicRecallEvaluator();
  }

  async execute(command: SubmitRecallAnswerCommand): Promise<SubmitRecallAnswerResult> {
    const session = await this.recallRepo.findById(command.sessionId);
    if (!session) {
      throw new SessionNotFoundError(`Recall session '${command.sessionId}' was not found`);
    }

    // 1. Idempotency Guard: Check if an attempt was already recorded for this (sessionId, promptIndex)
    const existingAttempt = await this.recallRepo.findAttemptBySessionAndIndex(
      command.sessionId,
      command.promptIndex,
    );
    if (existingAttempt) {
      return {
        outcome: existingAttempt.outcome,
        promptIndex: existingAttempt.promptIndex,
        isSessionCompleted: session.status === SessionStatus.COMPLETED,
      };
    }

    // 2. State validation: Reject if session is not active
    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new SessionNotActiveError(
        `Recall session '${command.sessionId}' is not active (status: ${session.status})`,
      );
    }

    // 3. PromptIndex alignment validation
    if (command.promptIndex !== session.currentPromptIndex) {
      throw new PromptIndexMismatchError(
        `Submitted promptIndex (${command.promptIndex}) does not match session currentPromptIndex (${session.currentPromptIndex})`,
      );
    }

    if (
      session.currentExpectedAnswer === null ||
      session.currentRecallMode === null ||
      session.currentCardKey === null ||
      session.currentPromptStartedAt === null
    ) {
      throw new Error(
        `Session '${session.id}' does not have an active prompt snapshot to evaluate against`,
      );
    }

    // 4. Deterministic evaluation strictly against snapshotted expectedAnswer
    const outcome = this.evaluator.evaluate(
      session.currentRecallMode,
      command.rawInput,
      session.currentExpectedAnswer,
    );

    const now = new Date();
    const durationMs = Math.max(
      0,
      now.getTime() - session.currentPromptStartedAt.getTime(),
    );

    const attempt = new RecallAttempt({
      id: randomUUID(),
      sessionId: session.id,
      promptIndex: session.currentPromptIndex,
      cardKey: session.currentCardKey,
      recallMode: session.currentRecallMode,
      rawInput: command.rawInput,
      expectedAnswer: session.currentExpectedAnswer,
      outcome,
      startedAt: session.currentPromptStartedAt,
      answeredAt: now,
      durationMs,
    });

    // 5. Calculate next prompt snapshot via strategy
    const driverId = command.driverId || session.driverId || DEFAULT_DRIVER_ID;
    const progress = await this.learningRepo.findByDriverAndVariant(
      driverId,
      session.targetVariantKey,
    );
    const variants = await this.getRouteVariantsUseCase.execute(session.routeId);
    const targetVariant = variants.find((v) => v.variantKey === session.targetVariantKey) ?? null;

    const nextPromptIndex = session.currentPromptIndex + 1;
    const tempSession = new RecallSession({
      id: session.id,
      driverId: session.driverId,
      routeId: session.routeId,
      targetVariantKey: session.targetVariantKey,
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: nextPromptIndex,
      currentCardKey: null,
      currentRecallMode: session.currentRecallMode,
      currentExpectedAnswer: null,
      currentPromptStartedAt: now,
      startedAt: session.startedAt,
      completedAt: null,
      abandonedAt: null,
    });

    const nextPrompt = this.promptStrategy.selectNextPrompt(
      tempSession,
      [...(progress?.cards ?? [])],
      targetVariant,
    );

    if (nextPrompt) {
      session.advanceCursor({
        nextPromptIndex,
        nextCardKey: nextPrompt.cardKey,
        nextRecallMode: nextPrompt.recallMode,
        nextExpectedAnswer: nextPrompt.expectedAnswer,
        nextPromptStartedAt: now,
      });
    } else {
      // Prompts exhausted: mark COMPLETED and clear active prompt snapshot
      session.advanceCursor({
        nextPromptIndex,
        nextCardKey: null,
        nextRecallMode: null,
        nextExpectedAnswer: null,
        nextPromptStartedAt: null,
      });
      session.complete(now);
    }

    // 6. Persist attempt and session mutation atomically in one DB transaction
    try {
      await this.recallRepo.saveAttemptAndAdvanceSession(attempt, session);

      return {
        outcome,
        promptIndex: command.promptIndex,
        isSessionCompleted: !nextPrompt,
      };
    } catch (err: unknown) {
      // 7. Concurrent Race Recovery: If a concurrent request already recorded this (sessionId, promptIndex)
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        const recoveredAttempt = await this.recallRepo.findAttemptBySessionAndIndex(
          command.sessionId,
          command.promptIndex,
        );
        if (recoveredAttempt) {
          const currentSession = await this.recallRepo.findById(command.sessionId);
          return {
            outcome: recoveredAttempt.outcome,
            promptIndex: recoveredAttempt.promptIndex,
            isSessionCompleted: currentSession?.status === SessionStatus.COMPLETED,
          };
        }
      }
      throw err;
    }
  }
}
