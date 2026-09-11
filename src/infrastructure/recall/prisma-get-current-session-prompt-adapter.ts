import { PrismaClient } from '@prisma/client';
import {
  GetCurrentSessionPromptPort,
  GetCurrentSessionPromptTxContext,
  LockedSessionData,
} from '@/application/recall/get-current-session-prompt-port';
import { SessionStatus } from '@/domain/recall/recall-session';
import { CardType } from '@/domain/learning/learning-card';
import { SessionNotFoundError } from '@/application/recall/get-current-session-prompt-use-case';

export class PrismaGetCurrentSessionPromptAdapter implements GetCurrentSessionPromptPort {
  constructor(private readonly prisma: PrismaClient) {}

  async runInTransaction<T>(
    work: (ctx: GetCurrentSessionPromptTxContext) => Promise<T>,
  ): Promise<T> {
    return await this.prisma.$transaction(async (tx) => {
      const ctx: GetCurrentSessionPromptTxContext = {
        lockSession: async (sessionId: string): Promise<LockedSessionData> => {
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
            }>
          >`
            SELECT id, "driverId", "routeId", "targetVariantKey", status, planned_card_ids, "currentPromptIndex", "currentPromptStartedAt"
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
          };
        },

        updatePromptStartedAt: async (sessionId: string, startedAt: Date): Promise<void> => {
          await tx.recallSession.update({
            where: { id: sessionId },
            data: { currentPromptStartedAt: startedAt },
          });
        },

        getCardDetails: async (cardId: string) => {
          const card = await tx.learningCard.findUnique({
            where: { id: cardId },
          });
          if (!card) return null;

          let stopId: string | null = null;
          if (card.cardKey.startsWith('NEXT_STOP::')) {
            const parts = card.cardKey.replace('NEXT_STOP::', '').split('->');
            stopId = parts[0] ?? null;
          } else if (card.cardKey.startsWith('STOP::')) {
            stopId = card.cardKey.replace('STOP::', '');
          }

          let stopName: string | null = null;
          if (stopId) {
            const gtfsStop = await tx.gtfsStop.findUnique({
              where: { id: stopId },
              select: { name: true },
            });
            stopName = gtfsStop?.name ?? null;
          }

          return {
            card: {
              id: card.id,
              cardKey: card.cardKey,
              cardType: card.cardType as CardType,
            },
            stopName,
          };
        },
      };

      return await work(ctx);
    });
  }
}
