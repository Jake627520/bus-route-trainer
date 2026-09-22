import { PrismaClient } from '@prisma/client';
import {
  GetRecallSessionStatePort,
  SessionStateData,
} from '@/application/recall/get-recall-session-state-port';
import { SessionStatus } from '@/domain/recall/recall-session';

export class PrismaGetRecallSessionStateAdapter implements GetRecallSessionStatePort {
  constructor(private readonly prisma: PrismaClient) {}

  async findSessionById(sessionId: string): Promise<SessionStateData | null> {
    const record = await this.prisma.recallSession.findUnique({
      where: { id: sessionId },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      driverId: record.driverId,
      routeId: record.routeId,
      targetVariantKey: record.targetVariantKey,
      status: record.status as SessionStatus,
      currentPromptIndex: record.currentPromptIndex,
      totalCards: record.plannedCardIds.length,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      abandonedAt: record.abandonedAt,
    };
  }
}
