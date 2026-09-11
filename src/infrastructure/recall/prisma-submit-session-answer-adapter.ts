import { PrismaClient } from '@prisma/client';
import {
  SubmitSessionAnswerPort,
  SubmitSessionAnswerTxContext,
  LockedRecallSessionData,
  CardEvaluationData,
} from '@/application/recall/submit-session-answer-port';
import { SessionStatus, RecallOutcome, RecallMode } from '@/domain/recall/recall-session';
import { CardState, CardType, LearningCard } from '@/domain/learning/learning-card';
import { SrsLevel } from '@/domain/srs/srs-interval-policy';
import { RecallAttempt } from '@/domain/recall/recall-attempt';
import { SessionNotFoundError } from '@/application/recall/submit-session-answer-use-case';

export class PrismaSubmitSessionAnswerAdapter implements SubmitSessionAnswerPort {
  constructor(private readonly prisma: PrismaClient) {}

  async runInTransaction<T>(
    work: (ctx: SubmitSessionAnswerTxContext) => Promise<T>,
  ): Promise<T> {
    return await this.prisma.$transaction(async (tx) => {
      const ctx: SubmitSessionAnswerTxContext = {
        lockSession: async (sessionId: string): Promise<LockedRecallSessionData> => {
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

        findAttempt: async (sessionId: string, promptIndex: number): Promise<RecallAttempt | null> => {
          const record = await tx.recallAttempt.findUnique({
            where: {
              sessionId_promptIndex: {
                sessionId,
                promptIndex,
              },
            },
          });
          if (!record) return null;

          return new RecallAttempt({
            id: record.id,
            sessionId: record.sessionId,
            promptIndex: record.promptIndex,
            cardKey: record.cardKey,
            recallMode: record.recallMode as RecallMode,
            rawInput: record.rawInput,
            expectedAnswer: record.expectedAnswer,
            outcome: record.outcome as RecallOutcome,
            startedAt: record.startedAt,
            answeredAt: record.answeredAt,
            durationMs: record.durationMs,
            resultingState: record.resultingState as CardState,
            resultingSrsLevel: record.resultingSrsLevel,
            resultingNextReviewAt: record.resultingNextReviewAt,
            resultingRepetitions: record.resultingRepetitions,
            resultingLapses: record.resultingLapses,
          });
        },

        lockCardAndResolveTarget: async (cardId: string): Promise<CardEvaluationData | null> => {
          const lockedCards = await tx.$queryRaw<
            Array<{
              id: string;
              progressId: string;
              cardKey: string;
              cardType: string;
              state: string;
              srs_level: number;
              nextReviewAt: Date | null;
              repetitions: number;
              lapses: number;
            }>
          >`
            SELECT id, "progressId", "cardKey", "cardType", state, srs_level, "nextReviewAt", repetitions, lapses
            FROM learning_card
            WHERE id = ${cardId}
            FOR UPDATE;
          `;

          if (!lockedCards || lockedCards.length === 0) return null;
          const r = lockedCards[0];

          const card = new LearningCard({
            id: r.id,
            progressId: r.progressId,
            cardKey: r.cardKey,
            cardType: r.cardType as CardType,
            state: r.state as CardState,
            srsLevel: r.srs_level as SrsLevel,
            nextReviewAt: r.nextReviewAt,
            repetitions: r.repetitions,
            lapses: r.lapses,
          });

          let defaultRecallMode: RecallMode;
          let expectedAnswer: string;

          if (card.cardKey.startsWith('NEXT_STOP::')) {
            defaultRecallMode = RecallMode.NEXT_STOP_FORWARD;
            const parts = card.cardKey.replace('NEXT_STOP::', '').split('->');
            expectedAnswer = parts[1] ?? '';
          } else if (card.cardKey.startsWith('STOP::')) {
            defaultRecallMode = RecallMode.STOP_NAME_RECOGNITION;
            const stopId = card.cardKey.replace('STOP::', '');
            const gtfsStop = await tx.gtfsStop.findUnique({
              where: { id: stopId },
              select: { name: true },
            });
            expectedAnswer = gtfsStop?.name ?? stopId;
          } else {
            defaultRecallMode = RecallMode.STOP_NAME_RECOGNITION;
            expectedAnswer = card.cardKey;
          }

          return {
            card,
            expectedAnswer,
            defaultRecallMode,
          };
        },

        createAttempt: async (attempt: RecallAttempt): Promise<RecallAttempt> => {
          await tx.recallAttempt.create({
            data: {
              id: attempt.id,
              sessionId: attempt.sessionId,
              promptIndex: attempt.promptIndex,
              cardKey: attempt.cardKey,
              recallMode: attempt.recallMode,
              rawInput: attempt.rawInput,
              expectedAnswer: attempt.expectedAnswer,
              outcome: attempt.outcome,
              startedAt: attempt.startedAt,
              answeredAt: attempt.answeredAt,
              durationMs: attempt.durationMs,
              resultingState: attempt.resultingState,
              resultingSrsLevel: attempt.resultingSrsLevel,
              resultingNextReviewAt: attempt.resultingNextReviewAt,
              resultingRepetitions: attempt.resultingRepetitions,
              resultingLapses: attempt.resultingLapses,
            },
          });
          return attempt;
        },

        updateCardSrs: async (params): Promise<void> => {
          await tx.learningCard.update({
            where: { id: params.cardId },
            data: {
              state: params.state,
              srsLevel: params.srsLevel,
              nextReviewAt: params.nextReviewAt,
              repetitions: params.repetitions,
              lapses: params.lapses,
            },
          });

          await tx.driverVariantProgress.update({
            where: { id: params.progressId },
            data: {
              lastStudiedAt: params.now,
            },
          });
        },

        advanceSession: async (params): Promise<void> => {
          await tx.recallSession.update({
            where: { id: params.sessionId },
            data: params.isCompleted
              ? {
                  currentPromptIndex: params.nextPromptIndex,
                  status: SessionStatus.COMPLETED,
                  completedAt: params.completedAt,
                  currentPromptStartedAt: null,
                }
              : {
                  currentPromptIndex: params.nextPromptIndex,
                  currentPromptStartedAt: null,
                },
          });
        },
      };

      return await work(ctx);
    });
  }
}
