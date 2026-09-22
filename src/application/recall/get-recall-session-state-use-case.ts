import { SessionStatus } from '@/domain/recall/recall-session';
import { GetRecallSessionStatePort } from './get-recall-session-state-port';

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Recall session with ID '${sessionId}' not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionOwnershipError extends Error {
  constructor(sessionId: string, driverId: string) {
    super(`Driver '${driverId}' is not authorized to access session '${sessionId}'`);
    this.name = 'SessionOwnershipError';
  }
}

export interface GetRecallSessionStateCommand {
  sessionId: string;
  driverId: string;
}

export interface RecallSessionStateDto {
  id: string;
  driverId: string;
  routeId: string;
  targetVariantKey: string;
  status: SessionStatus;
  currentPromptIndex: number;
  totalCards: number;
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
}

export interface GetRecallSessionStateResult {
  session: RecallSessionStateDto;
}

export class GetRecallSessionStateUseCase {
  constructor(private readonly port: GetRecallSessionStatePort) {}

  async execute(command: GetRecallSessionStateCommand): Promise<GetRecallSessionStateResult> {
    const sessionData = await this.port.findSessionById(command.sessionId);

    if (!sessionData) {
      throw new SessionNotFoundError(command.sessionId);
    }

    if (sessionData.driverId !== command.driverId) {
      throw new SessionOwnershipError(command.sessionId, command.driverId);
    }

    return {
      session: {
        id: sessionData.id,
        driverId: sessionData.driverId,
        routeId: sessionData.routeId,
        targetVariantKey: sessionData.targetVariantKey,
        status: sessionData.status,
        currentPromptIndex: sessionData.currentPromptIndex,
        totalCards: sessionData.totalCards,
        startedAt: sessionData.startedAt.toISOString(),
        completedAt: sessionData.completedAt ? sessionData.completedAt.toISOString() : null,
        abandonedAt: sessionData.abandonedAt ? sessionData.abandonedAt.toISOString() : null,
      },
    };
  }
}
