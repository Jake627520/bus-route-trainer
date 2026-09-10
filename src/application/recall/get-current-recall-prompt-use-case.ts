import { RecallRepository } from './recall-repository.port';
import { RecallMode, SessionStatus } from '../../domain/recall/recall-session';

export class SessionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionNotActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionNotActiveError';
  }
}

export interface GetCurrentRecallPromptQuery {
  sessionId: string;
  driverId?: string;
}

export interface CurrentRecallPromptDto {
  sessionId: string;
  promptIndex: number;
  cardKey: string;
  recallMode: RecallMode;
  givenReference: string;
  startedAt: Date;
}

export interface GetCurrentRecallPromptResult {
  prompt: CurrentRecallPromptDto | null;
}

export class GetCurrentRecallPromptUseCase {
  constructor(private readonly recallRepo: RecallRepository) {}

  async execute(query: GetCurrentRecallPromptQuery): Promise<GetCurrentRecallPromptResult> {
    const session = await this.recallRepo.findById(query.sessionId);

    if (!session) {
      throw new SessionNotFoundError(`Recall session '${query.sessionId}' was not found`);
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new SessionNotActiveError(
        `Recall session '${query.sessionId}' is not active (status: ${session.status})`,
      );
    }

    if (
      session.currentCardKey === null ||
      session.currentRecallMode === null ||
      session.currentPromptStartedAt === null
    ) {
      return { prompt: null };
    }

    // Extract reference from cardKey
    let givenReference = session.currentCardKey;
    if (session.currentCardKey.startsWith('NEXT_STOP::')) {
      const parts = session.currentCardKey.replace('NEXT_STOP::', '').split('->');
      givenReference = parts[0] ?? session.currentCardKey;
    } else if (session.currentCardKey.startsWith('STOP::')) {
      givenReference = session.currentCardKey.replace('STOP::', '');
    }

    return {
      prompt: {
        sessionId: session.id,
        promptIndex: session.currentPromptIndex,
        cardKey: session.currentCardKey,
        recallMode: session.currentRecallMode,
        givenReference,
        startedAt: session.currentPromptStartedAt,
      },
    };
  }
}
