import { RecallRepository } from './recall-repository.port';
import { RecallSession } from '../../domain/recall/recall-session';
import { SessionNotFoundError } from './get-current-recall-prompt-use-case';
import { RecallSessionDto } from './start-recall-session-use-case';

export interface CompleteRecallSessionCommand {
  sessionId: string;
  action: 'COMPLETE' | 'ABANDON';
  driverId?: string;
}

export interface CompleteRecallSessionResult {
  session: RecallSessionDto;
}

export class CompleteRecallSessionUseCase {
  constructor(private readonly recallRepo: RecallRepository) {}

  async execute(command: CompleteRecallSessionCommand): Promise<CompleteRecallSessionResult> {
    const session = await this.recallRepo.findById(command.sessionId);
    if (!session) {
      throw new SessionNotFoundError(`Recall session '${command.sessionId}' was not found`);
    }

    const now = new Date();
    if (command.action === 'COMPLETE') {
      session.complete(now);
    } else if (command.action === 'ABANDON') {
      session.abandon(now);
    }

    const updated = await this.recallRepo.updateSessionStatus(session);

    return {
      session: this.toDto(updated),
    };
  }

  private toDto(session: RecallSession): RecallSessionDto {
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
