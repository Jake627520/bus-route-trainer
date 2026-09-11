import { PrismaClient } from '@prisma/client';
import {
  AbandonRecallSessionPort,
  AbandonRecallSessionTxContext,
  AbandonableRecallSessionData,
} from '@/application/recall/abandon-recall-session-port';
import { SessionStatus } from '@/domain/recall/recall-session';
import { SessionNotFoundError } from '@/application/recall/abandon-recall-session-use-case';

export class PrismaAbandonRecallSessionAdapter implements AbandonRecallSessionPort {
  constructor(private readonly prisma: PrismaClient) {}

  async runInTransaction<T>(
    work: (ctx: AbandonRecallSessionTxContext) => Promise<T>,
  ): Promise<T> {
    return await this.prisma.$transaction(async (tx) => {
      const ctx: AbandonRecallSessionTxContext = {
        lockSession: async (sessionId: string): Promise<AbandonableRecallSessionData> => {
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              driverId: string;
              routeId: string;
              targetVariantKey: string;
              status: string;
              planned_card_ids: string[];
              currentPromptIndex: number;
              currentPromptStartedAt: Date | null;
              abandonedAt: Date | null;
            }>
          >`
            SELECT id, "driverId", "routeId", "targetVariantKey", status, planned_card_ids, "currentPromptIndex", "currentPromptStartedAt", "abandonedAt"
            FROM recall_session
            WHERE id = ${sessionId}
            FOR UPDATE;
          `;

          if (!rows || rows.length === 0) {
            throw new SessionNotFoundError(sessionId);
          }

          const r = rows[0];
          return {
            id: r.id,
            driverId: r.driverId,
            routeId: r.routeId,
            targetVariantKey: r.targetVariantKey,
            status: r.status as SessionStatus,
            plannedCardIds: r.planned_card_ids ?? [],
            currentPromptIndex: r.currentPromptIndex,
            currentPromptStartedAt: r.currentPromptStartedAt,
            abandonedAt: r.abandonedAt,
          };
        },

        markSessionAbandoned: async (params: { sessionId: string; abandonedAt: Date }): Promise<void> => {
          await tx.recallSession.update({
            where: { id: params.sessionId },
            data: {
              status: SessionStatus.ABANDONED,
              abandonedAt: params.abandonedAt,
              currentPromptStartedAt: null,
            },
          });
        },
      };

      return await work(ctx);
    });
  }
}
