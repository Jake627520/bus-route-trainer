import { randomUUID } from 'crypto';
import { RecallRepository } from './recall-repository.port';
import { LearningProgressRepository } from '../learning/learning-progress-repository.port';
import { GetRouteVariantsUseCase } from '../gtfs/get-route-variants-use-case';
import {
  PromptSelectionStrategy,
  SequentialTopologyPromptStrategy,
} from '../../domain/recall/prompt-selection-strategy';
import {
  RecallSession,
  SessionStatus,
  RecallMode,
} from '../../domain/recall/recall-session';
import { DEFAULT_DRIVER_ID } from '../learning/auth-constants';

export class VariantNotEnrolledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VariantNotEnrolledError';
  }
}

export interface StartRecallSessionCommand {
  driverId?: string;
  routeId: string;
  variantKey: string;
  recallMode?: RecallMode;
}

export interface RecallSessionDto {
  id: string;
  driverId: string;
  routeId: string;
  targetVariantKey: string;
  status: SessionStatus;
  currentPromptIndex: number;
  currentCardKey: string | null;
  currentRecallMode: RecallMode | null;
  currentPromptStartedAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  abandonedAt: Date | null;
}

export interface StartRecallSessionResult {
  session: RecallSessionDto;
  isNew: boolean;
}

export class StartRecallSessionUseCase {
  constructor(
    private readonly recallRepo: RecallRepository,
    private readonly learningRepo: LearningProgressRepository,
    private readonly getRouteVariantsUseCase: GetRouteVariantsUseCase,
    private readonly promptStrategy: PromptSelectionStrategy = new SequentialTopologyPromptStrategy(),
  ) {}

  async execute(command: StartRecallSessionCommand): Promise<StartRecallSessionResult> {
    const driverId = command.driverId || DEFAULT_DRIVER_ID;

    // 1. Verify driver enrollment in target variant
    const progress = await this.learningRepo.findByDriverAndVariant(
      driverId,
      command.variantKey,
    );
    if (!progress) {
      throw new VariantNotEnrolledError(
        `Driver '${driverId}' is not enrolled in route variant '${command.variantKey}'`,
      );
    }

    // 2. Sequential idempotency check: Return existing active session if one exists
    const active = await this.recallRepo.findActiveSession(driverId, command.variantKey);
    if (active) {
      return {
        session: this.toDto(active),
        isNew: false,
      };
    }

    // 3. Resolve variant topology for initial prompt snapshot
    const variants = await this.getRouteVariantsUseCase.execute(command.routeId);
    const targetVariant = variants.find((v) => v.variantKey === command.variantKey) ?? null;

    const sessionId = randomUUID();
    const now = new Date();

    const placeholderSession = new RecallSession({
      id: sessionId,
      driverId,
      routeId: command.routeId,
      targetVariantKey: command.variantKey,
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: 0,
      currentCardKey: null,
      currentRecallMode: command.recallMode ?? RecallMode.NEXT_STOP_FORWARD,
      currentExpectedAnswer: null,
      currentPromptStartedAt: now,
      startedAt: now,
      completedAt: null,
      abandonedAt: null,
    });

    const firstPrompt = this.promptStrategy.selectNextPrompt(
      placeholderSession,
      [...(progress.cards ?? [])],
      targetVariant,
    );

    const newSession = new RecallSession({
      id: sessionId,
      driverId,
      routeId: command.routeId,
      targetVariantKey: command.variantKey,
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: 0,
      currentCardKey: firstPrompt ? firstPrompt.cardKey : null,
      currentRecallMode: firstPrompt ? firstPrompt.recallMode : (command.recallMode ?? RecallMode.NEXT_STOP_FORWARD),
      currentExpectedAnswer: firstPrompt ? firstPrompt.expectedAnswer : null,
      currentPromptStartedAt: firstPrompt ? firstPrompt.createdAt : now,
      startedAt: now,
      completedAt: null,
      abandonedAt: null,
    });

    try {
      const persisted = await this.recallRepo.createSession(newSession);
      return {
        session: this.toDto(persisted),
        isNew: true,
      };
    } catch (err: unknown) {
      // 4. Concurrency resolution: Catch PostgreSQL partial unique index P2002 collision
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        const winningSession = await this.recallRepo.findActiveSession(
          driverId,
          command.variantKey,
        );
        if (winningSession) {
          return {
            session: this.toDto(winningSession),
            isNew: false,
          };
        }
      }
      throw err;
    }
  }

  public toDto(session: RecallSession): RecallSessionDto {
    return {
      id: session.id,
      driverId: session.driverId,
      routeId: session.routeId,
      targetVariantKey: session.targetVariantKey,
      status: session.status,
      currentPromptIndex: session.currentPromptIndex,
      currentCardKey: session.currentCardKey,
      currentRecallMode: session.currentRecallMode,
      currentPromptStartedAt: session.currentPromptStartedAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      abandonedAt: session.abandonedAt,
    };
  }
}
