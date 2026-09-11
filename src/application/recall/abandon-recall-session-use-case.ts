import { Clock, SystemClock } from '@/application/common/clock';
import { SessionStatus } from '@/domain/recall/recall-session';
import { AbandonRecallSessionPort } from './abandon-recall-session-port';

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

export class CannotAbandonCompletedSessionError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Cannot abandon session '${sessionId}' because it is already COMPLETED`);
    this.name = 'CannotAbandonCompletedSessionError';
  }
}

export interface AbandonRecallSessionCommand {
  readonly sessionId: string;
  readonly driverId: string;
}

export interface AbandonRecallSessionResult {
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly abandonedAt: Date;
  readonly currentPromptIndex: number;
  readonly totalCards: number;
}

export class AbandonRecallSessionUseCase {
  constructor(
    private readonly port: AbandonRecallSessionPort,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: AbandonRecallSessionCommand): Promise<AbandonRecallSessionResult> {
    const authoritativeNow = this.clock.now();

    return await this.port.runInTransaction(async (ctx) => {
      // 1. RecallSession FOR UPDATE
      const session = await ctx.lockSession(command.sessionId);

      // 2. Validate session ownership FIRST (precedes idempotency check)
      if (session.driverId !== command.driverId) {
        throw new SessionOwnershipError(command.sessionId, command.driverId);
      }

      // 3. Check if already ABANDONED (strictly idempotent, preserves original abandonedAt, zero DB writes)
      if (session.status === SessionStatus.ABANDONED) {
        return {
          sessionId: session.id,
          status: SessionStatus.ABANDONED,
          abandonedAt: session.abandonedAt ?? authoritativeNow,
          currentPromptIndex: session.currentPromptIndex,
          totalCards: session.plannedCardIds.length,
        };
      }

      // 4. Check if already COMPLETED (dedicated terminal error)
      if (session.status === SessionStatus.COMPLETED) {
        throw new CannotAbandonCompletedSessionError(command.sessionId);
      }

      // 5. IN_PROGRESS: mark session ABANDONED (preserves currentPromptIndex, clears timer)
      await ctx.markSessionAbandoned({
        sessionId: session.id,
        abandonedAt: authoritativeNow,
      });

      return {
        sessionId: session.id,
        status: SessionStatus.ABANDONED,
        abandonedAt: authoritativeNow,
        currentPromptIndex: session.currentPromptIndex,
        totalCards: session.plannedCardIds.length,
      };
    });
  }
}
