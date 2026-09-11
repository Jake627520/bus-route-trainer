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
import {
  evaluateCardTransition,
  calculateNextRepetitions,
  calculateNextLapses,
  calculateVariantProgressStatus,
} from '@/domain/learning/evaluate-card-transition';
import { SessionNotActiveError } from '@/application/recall/get-current-recall-prompt-use-case';

export class PrismaRecallSettlementCoordinator implements RecallSettlementCoordinator {
  constructor(private readonly prisma: PrismaClient) {}

  async settleAttempt(input: SettleRecallAttemptInput): Promise<SettleRecallAttemptOutput> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Verify session is IN_PROGRESS
        const sessionRecord = await tx.recallSession.findUnique({
          where: { id: input.sessionId },
        });

        if (!sessionRecord || sessionRecord.status !== PrismaSessionStatus.IN_PROGRESS) {
          throw new SessionNotActiveError(
            `Recall session '${input.sessionId}' is not active (status: ${sessionRecord?.status})`,
          );
        }

        // 2. Insert RecallAttempt
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
            answeredAt: input.answeredAt,
            durationMs: input.durationMs,
          },
        });

        // 3. Find progress and target LearningCard
        const progressRecord = await tx.driverVariantProgress.findUnique({
          where: {
            driverId_targetVariantKey: {
              driverId: input.driverId,
              targetVariantKey: input.targetVariantKey,
            },
          },
          include: { cards: true },
        });

        if (!progressRecord) {
          throw new Error(
            `DriverVariantProgress not found for driver '${input.driverId}' and variant '${input.targetVariantKey}'`,
          );
        }

        const targetCardRecord = progressRecord.cards.find(
          (c) => c.cardKey === input.cardKey,
        );

        if (!targetCardRecord) {
          throw new Error(`LearningCard not found for cardKey '${input.cardKey}'`);
        }

        // 4. Calculate state machine transition and counters
        const domainState = targetCardRecord.state as CardState;
        const reviewResult = input.outcome as 'PASS' | 'FAIL';
        const nextState = evaluateCardTransition(domainState, reviewResult);
        const nextRepetitions = calculateNextRepetitions(
          targetCardRecord.repetitions,
          reviewResult,
        );
        const nextLapses = calculateNextLapses(
          targetCardRecord.lapses,
          domainState,
          reviewResult,
        );

        // 5. Update LearningCard in tx (nextReviewAt untouched; no lastReviewedAt)
        const updatedCardRecord = await tx.learningCard.update({
          where: { id: targetCardRecord.id },
          data: {
            state: nextState as PrismaCardState,
            repetitions: nextRepetitions,
            lapses: nextLapses,
          },
        });

        // 6. Recalculate variant progress status (no progressPercent column)
        const updatedCards = progressRecord.cards.map((c) =>
          c.id === targetCardRecord.id
            ? { state: nextState }
            : { state: c.state as CardState },
        );
        const newProgressStatus = calculateVariantProgressStatus(updatedCards);

        await tx.driverVariantProgress.update({
          where: { id: progressRecord.id },
          data: {
            status: newProgressStatus as PrismaProgressStatus,
            lastStudiedAt: input.answeredAt,
          },
        });

        // 7. Advance RecallSession in tx
        const nextSnapshot = input.nextPromptSnapshot;
        const updatedSessionRecord = await tx.recallSession.update({
          where: { id: input.sessionId },
          data: input.isLastPrompt
            ? {
                status: PrismaSessionStatus.COMPLETED,
                completedAt: input.answeredAt,
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
    nextReviewAt: Date | null;
    repetitions: number;
    lapses: number;
  }): LearningCard {
    return new LearningCard({
      id: record.id,
      progressId: record.progressId,
      cardKey: record.cardKey,
      cardType: record.cardType as CardType,
      state: record.state as CardState,
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
