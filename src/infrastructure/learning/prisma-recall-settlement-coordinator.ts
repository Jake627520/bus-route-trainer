import { randomUUID } from 'crypto';
import {
  PrismaClient,
  Prisma,
  ProgressStatus as PrismaProgressStatus,
  CardState as PrismaCardState,
  SessionStatus as PrismaSessionStatus,
  RecallMode as PrismaRecallMode,
  RecallOutcome as PrismaRecallOutcome,
} from '@prisma/client';
import {
  RecallSettlementCoordinator,
  SettleRecallAttemptInput,
  SettleRecallAttemptOutput,
} from '@/application/learning/recall-settlement-coordinator';
import {
  CardState,
  CardType,
  LearningCard,
} from '@/domain/learning/learning-card';
import { ProgressStatus } from '@/domain/learning/driver-variant-progress';
import {
  RecallMode,
  RecallOutcome,
  RecallSession,
  SessionStatus,
} from '@/domain/recall/recall-session';
import { RecallAttempt } from '@/domain/recall/recall-attempt';
import { calculateVariantProgressStatus } from '@/domain/learning/evaluate-card-transition';
import { scheduleReview } from '@/domain/srs/schedule-review';
import { SrsLevel } from '@/domain/srs/srs-interval-policy';
import { Clock, SystemClock } from '@/application/common/clock';
import { SessionNotActiveError } from '@/application/recall/get-current-recall-prompt-use-case';

export class PrismaRecallSettlementCoordinator implements RecallSettlementCoordinator {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async settleAttempt(input: SettleRecallAttemptInput): Promise<SettleRecallAttemptOutput> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Authoritative Clock: single timestamp for the entire settlement transaction
        const authoritativeNow = this.clock.now();

        // 2. Verify session is IN_PROGRESS
        const sessionRecord = await tx.recallSession.findUnique({
          where: { id: input.sessionId },
        });

        if (!sessionRecord || sessionRecord.status !== PrismaSessionStatus.IN_PROGRESS) {
          throw new SessionNotActiveError(
            `Recall session '${input.sessionId}' is not active (status: ${sessionRecord?.status})`,
          );
        }

        // 3. Insert RecallAttempt (governed by unique constraint (sessionId, promptIndex))
        const attemptRecord = await tx.recallAttempt.create({
          data: {
            id: randomUUID(),
            sessionId: input.sessionId,
            promptIndex: input.promptIndex,
            cardKey: input.cardKey,
            recallMode: input.recallMode as PrismaRecallMode,
            rawInput: input.rawInput,
            expectedAnswer: input.expectedAnswer,
            outcome: input.outcome as PrismaRecallOutcome,
            startedAt: input.startedAt,
            answeredAt: authoritativeNow,
            durationMs: input.durationMs,
          },
        });

        // 4. Concurrency Guard: Pessimistic Row Lock (SELECT ... FOR UPDATE)
        // Resolves parent progress and locks the specific LearningCard BEFORE scheduleReview is invoked
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
          WHERE "progressId" = (
            SELECT id FROM driver_variant_progress
            WHERE "driverId" = ${input.driverId} AND "targetVariantKey" = ${input.targetVariantKey}
          )
          AND "cardKey" = ${input.cardKey}
          FOR UPDATE;
        `;

        if (!lockedCards || lockedCards.length === 0) {
          throw new Error(
            `LearningCard not found for cardKey '${input.cardKey}' (driver: '${input.driverId}', variant: '${input.targetVariantKey}')`,
          );
        }

        const targetCardRecord = lockedCards[0];

        // 5. Invoke Pure Domain SRS Scheduler on latest, locked row state
        const reviewResult = input.outcome as 'PASS' | 'FAIL';
        const decision = scheduleReview(
          {
            state: targetCardRecord.state as CardState,
            srsLevel: targetCardRecord.srs_level as SrsLevel,
            repetitions: targetCardRecord.repetitions,
            lapses: targetCardRecord.lapses,
            nextReviewAt: targetCardRecord.nextReviewAt,
          },
          reviewResult,
          authoritativeNow,
        );

        // 6. Update all 5 LearningCard fields atomically in tx
        const updatedCardRecord = await tx.learningCard.update({
          where: { id: targetCardRecord.id },
          data: {
            state: decision.nextState as PrismaCardState,
            srsLevel: decision.nextSrsLevel,
            nextReviewAt: decision.nextReviewAt,
            repetitions: decision.nextRepetitions,
            lapses: decision.nextLapses,
          },
        });

        // 7. Recalculate variant progress status
        const allCardsInProgress = await tx.learningCard.findMany({
          where: { progressId: targetCardRecord.progressId },
          select: { id: true, state: true },
        });

        const updatedCards = allCardsInProgress.map((c) =>
          c.id === targetCardRecord.id
            ? { state: decision.nextState }
            : { state: c.state as CardState },
        );
        const newProgressStatus = calculateVariantProgressStatus(updatedCards);

        await tx.driverVariantProgress.update({
          where: { id: targetCardRecord.progressId },
          data: {
            status: newProgressStatus as PrismaProgressStatus,
            lastStudiedAt: authoritativeNow,
          },
        });

        // 8. Advance RecallSession in tx
        const nextSnapshot = input.nextPromptSnapshot;
        const updatedSessionRecord = await tx.recallSession.update({
          where: { id: input.sessionId },
          data: input.isLastPrompt
            ? {
                status: PrismaSessionStatus.COMPLETED,
                completedAt: authoritativeNow,
                currentPromptIndex: input.promptIndex + 1,
                currentCardKey: null,
                currentRecallMode: null,
                currentExpectedAnswer: null,
                currentPromptStartedAt: null,
              }
            : {
                currentPromptIndex: nextSnapshot!.nextPromptIndex,
                currentCardKey: nextSnapshot!.nextCardKey,
                currentRecallMode: nextSnapshot!.nextRecallMode as PrismaRecallMode,
                currentExpectedAnswer: nextSnapshot!.nextExpectedAnswer,
                currentPromptStartedAt: nextSnapshot!.nextPromptStartedAt,
              },
        });

        return {
          attempt: this.toDomainAttempt(attemptRecord),
          card: this.toDomainCard(updatedCardRecord),
          progressStatus: newProgressStatus,
          session: this.toDomainSession(updatedSessionRecord),
          isDuplicate: false,
        };
      });
    } catch (err: unknown) {
      // Catch P2002 specifically on (sessionId, promptIndex)
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = (err.meta?.target as string[] | string) ?? '';
        const targetStr = Array.isArray(target) ? target.join(',') : String(target);
        const isIdempotencyKey =
          (targetStr.includes('sessionId') && targetStr.includes('promptIndex')) ||
          targetStr.includes('sessionId_promptIndex');

        if (isIdempotencyKey) {
          // OUTSIDE the failed transaction: query existing attempt
          const existingAttempt = await this.prisma.recallAttempt.findUnique({
            where: {
              sessionId_promptIndex: {
                sessionId: input.sessionId,
                promptIndex: input.promptIndex,
              },
            },
          });

          if (existingAttempt) {
            const [cardRecord, progressRecord, sessionRecord] = await Promise.all([
              this.prisma.learningCard.findFirst({
                where: {
                  cardKey: input.cardKey,
                  progress: {
                    driverId: input.driverId,
                    targetVariantKey: input.targetVariantKey,
                  },
                },
              }),
              this.prisma.driverVariantProgress.findUnique({
                where: {
                  driverId_targetVariantKey: {
                    driverId: input.driverId,
                    targetVariantKey: input.targetVariantKey,
                  },
                },
              }),
              this.prisma.recallSession.findUnique({
                where: { id: input.sessionId },
              }),
            ]);

            return {
              attempt: this.toDomainAttempt(existingAttempt),
              card: cardRecord ? this.toDomainCard(cardRecord) : null!,
              progressStatus: progressRecord
                ? (progressRecord.status as ProgressStatus)
                : ProgressStatus.IN_PROGRESS,
              session: sessionRecord ? this.toDomainSession(sessionRecord) : null!,
              isDuplicate: true,
            };
          }
        }
      }

      // Re-throw any unrelated P2002 or other errors
      throw err;
    }
  }

  private toDomainAttempt(record: {
    id: string;
    sessionId: string;
    promptIndex: number;
    cardKey: string;
    recallMode: string;
    rawInput: string;
    expectedAnswer: string;
    outcome: string;
    startedAt: Date;
    answeredAt: Date;
    durationMs: number;
  }): RecallAttempt {
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
    });
  }

  private toDomainCard(record: {
    id: string;
    progressId: string;
    cardKey: string;
    cardType: string;
    state: string;
    srsLevel?: number;
    srs_level?: number;
    nextReviewAt: Date | null;
    repetitions: number;
    lapses: number;
  }): LearningCard {
    const rawLevel = record.srsLevel ?? record.srs_level ?? 0;
    return new LearningCard({
      id: record.id,
      progressId: record.progressId,
      cardKey: record.cardKey,
      cardType: record.cardType as CardType,
      state: record.state as CardState,
      srsLevel: rawLevel as SrsLevel,
      nextReviewAt: record.nextReviewAt,
      repetitions: record.repetitions,
      lapses: record.lapses,
    });
  }

  private toDomainSession(record: {
    id: string;
    driverId: string;
    routeId: string;
    targetVariantKey: string;
    status: string;
    currentPromptIndex: number;
    currentCardKey: string | null;
    currentRecallMode: string | null;
    currentExpectedAnswer: string | null;
    currentPromptStartedAt: Date | null;
    startedAt: Date;
    completedAt: Date | null;
    abandonedAt: Date | null;
  }): RecallSession {
    return new RecallSession({
      id: record.id,
      driverId: record.driverId,
      routeId: record.routeId,
      targetVariantKey: record.targetVariantKey,
      status: record.status as SessionStatus,
      currentPromptIndex: record.currentPromptIndex,
      currentCardKey: record.currentCardKey,
      currentRecallMode: record.currentRecallMode
        ? (record.currentRecallMode as RecallMode)
        : null,
      currentExpectedAnswer: record.currentExpectedAnswer,
      currentPromptStartedAt: record.currentPromptStartedAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      abandonedAt: record.abandonedAt,
    });
  }
}
