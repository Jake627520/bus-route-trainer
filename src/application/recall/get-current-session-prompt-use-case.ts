import { RecallMode, SessionStatus } from '@/domain/recall/recall-session';
import { Clock, SystemClock } from '@/application/common/clock';
import { GetCurrentSessionPromptPort } from './get-current-session-prompt-port';

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

export interface GetCurrentSessionPromptQuery {
  readonly sessionId: string;
  readonly driverId: string;
}

export interface CurrentSessionPromptDto {
  readonly sessionId: string;
  readonly promptIndex: number;
  readonly totalCards: number;
  readonly cardId: string;
  readonly cardKey: string;
  readonly recallMode: RecallMode;
  readonly givenReference: string;
  readonly startedAt: Date;
}

export interface GetCurrentSessionPromptResult {
  readonly prompt: CurrentSessionPromptDto;
}

export class GetCurrentSessionPromptUseCase {
  constructor(
    private readonly port: GetCurrentSessionPromptPort,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(query: GetCurrentSessionPromptQuery): Promise<GetCurrentSessionPromptResult> {
    return await this.port.runInTransaction(async (ctx) => {
      // 1. Acquire row lock (SELECT ... FOR UPDATE) on RecallSession
      const session = await ctx.lockSession(query.sessionId);

      // 2. Validate ownership
      if (session.driverId !== query.driverId) {
        throw new SessionOwnershipError(query.sessionId, query.driverId);
      }

      // 3. Validate status === IN_PROGRESS
      if (session.status !== SessionStatus.IN_PROGRESS) {
        throw new SessionNotActiveError(query.sessionId, session.status);
      }

      // 4. Validate cursor boundary
      if (
        session.currentPromptIndex < 0 ||
        session.currentPromptIndex >= session.plannedCardIds.length
      ) {
        throw new Error(
          `Invalid prompt index ${session.currentPromptIndex} for session ${session.id}`,
        );
      }

      // 5. Timer exactly-once initialization
      let startedAt: Date;
      if (session.currentPromptStartedAt === null) {
        startedAt = this.clock.now();
        await ctx.updatePromptStartedAt(session.id, startedAt);
      } else {
        startedAt = session.currentPromptStartedAt;
      }

      // 6. Dynamic prompt resolution from plannedCardIds snapshot
      const targetCardId = session.plannedCardIds[session.currentPromptIndex];
      const cardDetails = await ctx.getCardDetails(targetCardId);
      if (!cardDetails) {
        throw new Error(
          `LearningCard '${targetCardId}' not found for prompt index ${session.currentPromptIndex}`,
        );
      }

      const { card, stopName } = cardDetails;

      let recallMode: RecallMode;
      let givenReference = card.cardKey;

      if (card.cardKey.startsWith('NEXT_STOP::')) {
        recallMode = RecallMode.NEXT_STOP_FORWARD;
        const parts = card.cardKey.replace('NEXT_STOP::', '').split('->');
        const fromStopId = parts[0] ?? card.cardKey;
        givenReference = stopName ?? fromStopId;
      } else if (card.cardKey.startsWith('STOP::')) {
        recallMode = RecallMode.STOP_NAME_RECOGNITION;
        const stopId = card.cardKey.replace('STOP::', '');
        givenReference = stopName ?? stopId;
      } else {
        recallMode = RecallMode.STOP_NAME_RECOGNITION;
      }

      return {
        prompt: {
          sessionId: session.id,
          promptIndex: session.currentPromptIndex,
          totalCards: session.plannedCardIds.length,
          cardId: card.id,
          cardKey: card.cardKey,
          recallMode,
          givenReference,
          startedAt,
        },
      };
    });
  }
}
