import { PrismaClient } from '@prisma/client';
import { RecallRepository } from '../../application/recall/recall-repository.port';
import { CardState } from '../../domain/learning/learning-card';
import {
  RecallSession,
  SessionStatus,
  RecallMode,
  RecallOutcome,
} from '../../domain/recall/recall-session';
import { RecallAttempt } from '../../domain/recall/recall-attempt';

export class PrismaRecallRepository implements RecallRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveSession(driverId: string, variantKey: string): Promise<RecallSession | null> {
    const record = await this.prisma.recallSession.findFirst({
      where: {
        driverId,
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
      },
    });

    if (!record) return null;
    return this.toDomainSession(record);
  }

  async findById(sessionId: string): Promise<RecallSession | null> {
    const record = await this.prisma.recallSession.findUnique({
      where: { id: sessionId },
    });

    if (!record) return null;
    return this.toDomainSession(record);
  }

  async findAttemptBySessionAndIndex(
    sessionId: string,
    promptIndex: number,
  ): Promise<RecallAttempt | null> {
    const record = await this.prisma.recallAttempt.findUnique({
      where: {
        sessionId_promptIndex: {
          sessionId,
          promptIndex,
        },
      },
    });

    if (!record) return null;
    return this.toDomainAttempt(record);
  }

  async findAttemptsBySessionId(sessionId: string): Promise<RecallAttempt[]> {
    const records = await this.prisma.recallAttempt.findMany({
      where: { sessionId },
      orderBy: { promptIndex: 'asc' },
    });

    return records.map((r) => this.toDomainAttempt(r));
  }

  async createSession(session: RecallSession): Promise<RecallSession> {
    const record = await this.prisma.recallSession.create({
      data: {
        id: session.id,
        driverId: session.driverId,
        routeId: session.routeId,
        targetVariantKey: session.targetVariantKey,
        status: session.status,
        plannedCardIds: [...session.plannedCardIds],
        currentPromptIndex: session.currentPromptIndex,
        currentCardKey: session.currentCardKey,
        currentRecallMode: session.currentRecallMode,
        currentExpectedAnswer: session.currentExpectedAnswer,
        currentPromptStartedAt: session.currentPromptStartedAt,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        abandonedAt: session.abandonedAt,
      },
    });

    return this.toDomainSession(record);
  }

  async saveAttemptAndAdvanceSession(
    attempt: RecallAttempt,
    updatedSession: RecallSession,
  ): Promise<{ attempt: RecallAttempt; session: RecallSession }> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Verify session is currently IN_PROGRESS in DB
      const current = await tx.recallSession.findUnique({
        where: { id: updatedSession.id },
      });

      if (!current || current.status !== SessionStatus.IN_PROGRESS) {
        throw new Error(
          `Cannot record attempt on session ${updatedSession.id} because it is not IN_PROGRESS`,
        );
      }

      // 2. Persist RecallAttempt
      const attemptRecord = await tx.recallAttempt.create({
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

      // 3. Advance RecallSession state
      const sessionRecord = await tx.recallSession.update({
        where: { id: updatedSession.id },
        data: {
          status: updatedSession.status,
          currentPromptIndex: updatedSession.currentPromptIndex,
          currentCardKey: updatedSession.currentCardKey,
          currentRecallMode: updatedSession.currentRecallMode,
          currentExpectedAnswer: updatedSession.currentExpectedAnswer,
          currentPromptStartedAt: updatedSession.currentPromptStartedAt,
          completedAt: updatedSession.completedAt,
          abandonedAt: updatedSession.abandonedAt,
        },
      });

      return {
        attempt: this.toDomainAttempt(attemptRecord),
        session: this.toDomainSession(sessionRecord),
      };
    });
  }

  async updateSessionStatus(session: RecallSession): Promise<RecallSession> {
    const record = await this.prisma.recallSession.update({
      where: { id: session.id },
      data: {
        status: session.status,
        completedAt: session.completedAt,
        abandonedAt: session.abandonedAt,
        currentCardKey: session.currentCardKey,
        currentRecallMode: session.currentRecallMode,
        currentExpectedAnswer: session.currentExpectedAnswer,
        currentPromptStartedAt: session.currentPromptStartedAt,
      },
    });

    return this.toDomainSession(record);
  }

  private toDomainSession(record: {
    id: string;
    driverId: string;
    routeId: string;
    targetVariantKey: string;
    status: string;
    plannedCardIds?: string[];
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
      plannedCardIds:
        record.plannedCardIds && record.plannedCardIds.length > 0
          ? record.plannedCardIds
          : (record.currentCardKey ? [record.currentCardKey] : ['legacy-card']),
      currentPromptIndex: record.currentPromptIndex,
      currentCardKey: record.currentCardKey,
      currentRecallMode: record.currentRecallMode ? (record.currentRecallMode as RecallMode) : null,
      currentExpectedAnswer: record.currentExpectedAnswer,
      currentPromptStartedAt: record.currentPromptStartedAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      abandonedAt: record.abandonedAt,
    });
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
    resultingState?: string;
    resultingSrsLevel?: number;
    resultingNextReviewAt?: Date | null;
    resultingRepetitions?: number;
    resultingLapses?: number;
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
      resultingState: record.resultingState ? (record.resultingState as CardState) : CardState.NEW,
      resultingSrsLevel: record.resultingSrsLevel ?? 0,
      resultingNextReviewAt: record.resultingNextReviewAt ?? null,
      resultingRepetitions: record.resultingRepetitions ?? 0,
      resultingLapses: record.resultingLapses ?? 0,
    });
  }
}
