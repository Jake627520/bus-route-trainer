import { PrismaClient } from '@prisma/client';
import {
  StartPlannedRecallSessionPort,
  StartPlannedSessionTxContext,
} from '@/application/recall/start-planned-recall-session-port';
import { RecallSession, SessionStatus } from '@/domain/recall/recall-session';
import { DriverNotEnrolledError } from '@/application/recall/start-planned-recall-session-use-case';
import { CardState } from '@/domain/learning/learning-card';
import { RecallQueueCandidate } from '@/domain/learning/recall-queue-policy';

export class PrismaStartPlannedRecallSessionAdapter implements StartPlannedRecallSessionPort {
  constructor(private readonly prisma: PrismaClient) {}

  async runInTransaction<T>(
    work: (ctx: StartPlannedSessionTxContext) => Promise<T>,
  ): Promise<T> {
    return await this.prisma.$transaction(async (tx) => {
      const ctx: StartPlannedSessionTxContext = {
        lockDriverVariantProgress: async (driverId: string, variantKey: string) => {
          const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM driver_variant_progress
            WHERE "driverId" = ${driverId} AND "targetVariantKey" = ${variantKey}
            FOR UPDATE;
          `;

          if (!rows || rows.length === 0) {
            throw new DriverNotEnrolledError(driverId, variantKey);
          }

          return { progressId: rows[0].id };
        },

        findActiveSession: async (driverId: string, variantKey: string) => {
          const record = await tx.recallSession.findFirst({
            where: {
              driverId,
              targetVariantKey: variantKey,
              status: SessionStatus.IN_PROGRESS,
            },
          });

          if (!record) return null;

          return new RecallSession({
            id: record.id,
            driverId: record.driverId,
            routeId: record.routeId,
            targetVariantKey: record.targetVariantKey,
            status: record.status as SessionStatus,
            plannedCardIds: record.plannedCardIds,
            currentPromptIndex: record.currentPromptIndex,
            currentCardKey: record.currentCardKey,
            currentRecallMode: null,
            currentExpectedAnswer: record.currentExpectedAnswer,
            currentPromptStartedAt: record.currentPromptStartedAt,
            startedAt: record.startedAt,
            completedAt: record.completedAt,
            abandonedAt: record.abandonedAt,
          });
        },

        queryCandidates: async (progressId: string, now: Date) => {
          const [dueRecords, newRecords] = await Promise.all([
            tx.learningCard.findMany({
              where: {
                progressId,
                nextReviewAt: {
                  lte: now,
                  not: null,
                },
              },
              orderBy: [
                { nextReviewAt: 'asc' },
                { id: 'asc' },
              ],
            }),
            tx.learningCard.findMany({
              where: {
                progressId,
                state: CardState.NEW,
                nextReviewAt: null,
              },
              orderBy: { id: 'asc' },
            }),
          ]);

          const toCandidate = (r: {
            id: string;
            state: string;
            nextReviewAt: Date | null;
          }): RecallQueueCandidate => ({
            cardId: r.id,
            state: r.state as CardState,
            nextReviewAt: r.nextReviewAt,
          });

          return {
            dueCandidates: dueRecords.map(toCandidate),
            newCandidates: newRecords.map(toCandidate),
          };
        },

        createSession: async (session: RecallSession) => {
          const record = await tx.recallSession.create({
            data: {
              id: session.id,
              driverId: session.driverId,
              routeId: session.routeId,
              targetVariantKey: session.targetVariantKey,
              status: session.status,
              plannedCardIds: [...session.plannedCardIds],
              currentPromptIndex: session.currentPromptIndex,
              currentCardKey: session.currentCardKey,
              currentRecallMode: null,
              currentExpectedAnswer: session.currentExpectedAnswer,
              currentPromptStartedAt: session.currentPromptStartedAt,
              startedAt: session.startedAt,
              completedAt: session.completedAt,
              abandonedAt: session.abandonedAt,
            },
          });

          return new RecallSession({
            id: record.id,
            driverId: record.driverId,
            routeId: record.routeId,
            targetVariantKey: record.targetVariantKey,
            status: record.status as SessionStatus,
            plannedCardIds: record.plannedCardIds,
            currentPromptIndex: record.currentPromptIndex,
            currentCardKey: record.currentCardKey,
            currentRecallMode: null,
            currentExpectedAnswer: record.currentExpectedAnswer,
            currentPromptStartedAt: record.currentPromptStartedAt,
            startedAt: record.startedAt,
            completedAt: record.completedAt,
            abandonedAt: record.abandonedAt,
          });
        },
      };

      return await work(ctx);
    });
  }
}
