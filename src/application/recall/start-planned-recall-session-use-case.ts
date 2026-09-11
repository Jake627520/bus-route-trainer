import { randomUUID } from 'crypto';
import { RecallSession, SessionStatus } from '@/domain/recall/recall-session';
import {
  DEFAULT_SESSION_SIZE,
  selectRecallQueue,
} from '@/domain/learning/recall-queue-policy';
import { Clock, SystemClock } from '@/application/common/clock';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { StartPlannedRecallSessionPort } from './start-planned-recall-session-port';

export class DriverNotEnrolledError extends Error {
  constructor(public readonly driverId: string, public readonly variantKey: string) {
    super(`Driver '${driverId}' is not enrolled in variant '${variantKey}'`);
    this.name = 'DriverNotEnrolledError';
  }
}

export interface StartPlannedRecallSessionCommand {
  readonly driverId?: string;
  readonly routeId: string;
  readonly variantKey: string;
  readonly sessionSize?: number;
  readonly dueRatio?: number;
}

export interface RecallSessionDto {
  readonly id: string;
  readonly driverId: string;
  readonly routeId: string;
  readonly targetVariantKey: string;
  readonly status: SessionStatus;
  readonly plannedCardIds: readonly string[];
  readonly currentPromptIndex: number;
  readonly currentPromptStartedAt: Date | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly abandonedAt: Date | null;
}

export interface StartPlannedRecallSessionResult {
  readonly session: RecallSessionDto | null;
  readonly isNew: boolean;
  readonly reason?: 'NO_ELIGIBLE_CARDS';
}

export class StartPlannedRecallSessionUseCase {
  constructor(
    private readonly port: StartPlannedRecallSessionPort,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: StartPlannedRecallSessionCommand): Promise<StartPlannedRecallSessionResult> {
    const authoritativeNow = this.clock.now();
    const driverId = command.driverId || DEFAULT_DRIVER_ID;

    return await this.port.runInTransaction(async (ctx) => {
      // 1. SELECT DriverVariantProgress FOR UPDATE (throws DriverNotEnrolledError if not enrolled)
      const { progressId } = await ctx.lockDriverVariantProgress(driverId, command.variantKey);

      // 2. Active session check
      const activeSession = await ctx.findActiveSession(driverId, command.variantKey);
      if (activeSession) {
        return {
          session: this.toDto(activeSession),
          isNew: false,
        };
      }

      // 3. Query planning candidates within the same transaction context
      const { dueCandidates, newCandidates } = await ctx.queryCandidates(progressId, authoritativeNow);

      // 4. Select recall queue via pure domain policy
      const queueResult = selectRecallQueue({
        dueCards: dueCandidates,
        newCards: newCandidates,
        now: authoritativeNow,
        sessionSize: command.sessionSize ?? DEFAULT_SESSION_SIZE,
        dueRatio: command.dueRatio,
      });

      if (queueResult.cardIds.length === 0) {
        return {
          session: null,
          isNew: false,
          reason: 'NO_ELIGIBLE_CARDS',
        };
      }

      // 5. Create new RecallSession domain aggregate
      const sessionId = randomUUID();
      const newSession = new RecallSession({
        id: sessionId,
        driverId,
        routeId: command.routeId,
        targetVariantKey: command.variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: queueResult.cardIds,
        currentPromptIndex: 0,
        currentPromptStartedAt: authoritativeNow,
        startedAt: authoritativeNow,
        completedAt: null,
        abandonedAt: null,
      });

      const persisted = await ctx.createSession(newSession);
      return {
        session: this.toDto(persisted),
        isNew: true,
      };
    });
  }

  private toDto(session: RecallSession): RecallSessionDto {
    return {
      id: session.id,
      driverId: session.driverId,
      routeId: session.routeId,
      targetVariantKey: session.targetVariantKey,
      status: session.status,
      plannedCardIds: session.plannedCardIds,
      currentPromptIndex: session.currentPromptIndex,
      currentPromptStartedAt: session.currentPromptStartedAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      abandonedAt: session.abandonedAt,
    };
  }
}
