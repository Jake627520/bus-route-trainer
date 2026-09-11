import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  AbandonRecallSessionUseCase,
  CannotAbandonCompletedSessionError,
  SessionOwnershipError,
} from '@/application/recall/abandon-recall-session-use-case';
import { PrismaAbandonRecallSessionAdapter } from '@/infrastructure/recall/prisma-abandon-recall-session-adapter';
import { SubmitSessionAnswerUseCase, SessionNotActiveError } from '@/application/recall/submit-session-answer-use-case';
import { PrismaSubmitSessionAnswerAdapter } from '@/infrastructure/recall/prisma-submit-session-answer-adapter';
import { StartPlannedRecallSessionUseCase } from '@/application/recall/start-planned-recall-session-use-case';
import { PrismaStartPlannedRecallSessionAdapter } from '@/infrastructure/recall/prisma-start-planned-recall-session-adapter';
import { SessionStatus, RecallOutcome, RecallMode } from '@/domain/recall/recall-session';
import { CardState } from '@/domain/learning/learning-card';
import { AbandonRecallSessionPort, AbandonRecallSessionTxContext } from '@/application/recall/abandon-recall-session-port';
import { SubmitSessionAnswerPort, SubmitSessionAnswerTxContext } from '@/application/recall/submit-session-answer-port';

describe('AbandonRecallSessionUseCase Integration & Concurrency Tests (Change 08 Phase 6)', () => {
  const prisma = new PrismaClient();
  let useCase: AbandonRecallSessionUseCase;
  let submitUseCase: SubmitSessionAnswerUseCase;
  let startPlannedUseCase: StartPlannedRecallSessionUseCase;

  beforeAll(async () => {
    await prisma.$connect();
    const adapter = new PrismaAbandonRecallSessionAdapter(prisma);
    useCase = new AbandonRecallSessionUseCase(adapter);

    const submitAdapter = new PrismaSubmitSessionAnswerAdapter(prisma);
    submitUseCase = new SubmitSessionAnswerUseCase(submitAdapter);

    const startAdapter = new PrismaStartPlannedRecallSessionAdapter(prisma);
    startPlannedUseCase = new StartPlannedRecallSessionUseCase(startAdapter);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
  });

  // 1. IN_PROGRESS -> ABANDONED and clears timer
  it('1. transitions IN_PROGRESS session to ABANDONED, sets abandonedAt, and clears timer', async () => {
    const driverId = 'driver-abandon-1';
    const variantKey = 'route-66:dir-0:hash-abandon-1';
    const timerStarted = new Date(Date.now() - 30_000);

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: ['card-1', 'card-2'],
        currentPromptIndex: 0,
        currentPromptStartedAt: timerStarted,
      },
    });

    const result = await useCase.execute({
      sessionId: session.id,
      driverId,
    });

    expect(result.status).toBe(SessionStatus.ABANDONED);
    expect(result.abandonedAt).toBeInstanceOf(Date);
    expect(result.currentPromptIndex).toBe(0);
    expect(result.totalCards).toBe(2);

    const updated = await prisma.recallSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.status).toBe(SessionStatus.ABANDONED);
    expect(updated.abandonedAt).not.toBeNull();
    expect(updated.currentPromptStartedAt).toBeNull();
  });

  // 2. Preserves settled Attempts and LearningCard SRS states committed before abandonment
  it('2. preserves settled Attempts and LearningCard SRS states committed before abandonment', async () => {
    const driverId = 'driver-abandon-2';
    const variantKey = 'route-66:dir-0:hash-abandon-2';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
      },
    });

    const card1 = await prisma.learningCard.create({
      data: {
        progressId: progress.id,
        cardKey: 'STOP::s1',
        cardType: 'STOP',
        state: CardState.REVIEW,
        srsLevel: 2,
        repetitions: 2,
        lapses: 0,
      },
    });

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [card1.id, 'card-2'],
        currentPromptIndex: 1,
      },
    });

    const attempt1 = await prisma.recallAttempt.create({
      data: {
        sessionId: session.id,
        promptIndex: 0,
        cardKey: card1.cardKey,
        recallMode: RecallMode.STOP_NAME_RECOGNITION,
        rawInput: 'Stop 1',
        expectedAnswer: 'Stop 1',
        outcome: RecallOutcome.PASS,
        startedAt: new Date(Date.now() - 60_000),
        answeredAt: new Date(Date.now() - 50_000),
        durationMs: 10_000,
        resultingState: CardState.REVIEW,
        resultingSrsLevel: 2,
        resultingRepetitions: 2,
        resultingLapses: 0,
      },
    });

    await useCase.execute({ sessionId: session.id, driverId });

    // Verify attempt remains committed
    const attempts = await prisma.recallAttempt.findMany({ where: { sessionId: session.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].id).toBe(attempt1.id);

    // Verify card SRS state remains committed
    const card1After = await prisma.learningCard.findUniqueOrThrow({ where: { id: card1.id } });
    expect(card1After.state).toBe(CardState.REVIEW);
    expect(card1After.srsLevel).toBe(2);
    expect(card1After.repetitions).toBe(2);
  });

  // 3. Leaves in-flight prompt untouched without creating RecallAttempt or mutating card SRS
  it('3. leaves in-flight prompt untouched without creating RecallAttempt or mutating card SRS', async () => {
    const driverId = 'driver-abandon-3';
    const variantKey = 'route-66:dir-0:hash-abandon-3';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
      },
    });

    const cardInFlight = await prisma.learningCard.create({
      data: {
        progressId: progress.id,
        cardKey: 'STOP::s-inflight',
        cardType: 'STOP',
        state: CardState.NEW,
        srsLevel: 0,
        repetitions: 0,
        lapses: 0,
      },
    });

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [cardInFlight.id],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    await useCase.execute({ sessionId: session.id, driverId });

    // Zero attempts created
    const attempts = await prisma.recallAttempt.findMany({ where: { sessionId: session.id } });
    expect(attempts).toHaveLength(0);

    // Card SRS state untouched
    const cardAfter = await prisma.learningCard.findUniqueOrThrow({ where: { id: cardInFlight.id } });
    expect(cardAfter.state).toBe(CardState.NEW);
    expect(cardAfter.srsLevel).toBe(0);
    expect(cardAfter.repetitions).toBe(0);
  });

  // 4. Idempotent replay when session is already ABANDONED (preserves original abandonedAt)
  it('4. is idempotent when session is already ABANDONED and preserves original abandonedAt', async () => {
    const driverId = 'driver-abandon-4';
    const originalAbandonedAt = new Date('2026-09-01T10:00:00.000Z');

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: 'route-66:dir-0:hash-abandon-4',
        status: SessionStatus.ABANDONED,
        plannedCardIds: ['c1'],
        currentPromptIndex: 0,
        abandonedAt: originalAbandonedAt,
      },
    });

    const result = await useCase.execute({ sessionId: session.id, driverId });

    expect(result.status).toBe(SessionStatus.ABANDONED);
    expect(result.abandonedAt.toISOString()).toBe(originalAbandonedAt.toISOString());

    const inDb = await prisma.recallSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(inDb.abandonedAt?.toISOString()).toBe(originalAbandonedAt.toISOString());
  });

  // 5. Rejects abandoning a COMPLETED session with CannotAbandonCompletedSessionError
  it('5. rejects abandoning a COMPLETED session with CannotAbandonCompletedSessionError', async () => {
    const driverId = 'driver-abandon-5';

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: 'route-66:dir-0:hash-abandon-5',
        status: SessionStatus.COMPLETED,
        plannedCardIds: ['c1'],
        currentPromptIndex: 1,
        completedAt: new Date(),
      },
    });

    await expect(useCase.execute({ sessionId: session.id, driverId })).rejects.toThrow(
      CannotAbandonCompletedSessionError,
    );

    const inDb = await prisma.recallSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(inDb.status).toBe(SessionStatus.COMPLETED);
    expect(inDb.abandonedAt).toBeNull();
  });

  // 6. Rejects request if driver is not session owner with SessionOwnershipError
  it('6. rejects request if driver is not session owner with SessionOwnershipError', async () => {
    const ownerId = 'driver-owner';
    const intruderId = 'driver-intruder';

    const session = await prisma.recallSession.create({
      data: {
        driverId: ownerId,
        routeId: 'route-66',
        targetVariantKey: 'route-66:dir-0:hash-abandon-6',
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: ['c1'],
        currentPromptIndex: 0,
      },
    });

    await expect(useCase.execute({ sessionId: session.id, driverId: intruderId })).rejects.toThrow(
      SessionOwnershipError,
    );

    const inDb = await prisma.recallSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(inDb.status).toBe(SessionStatus.IN_PROGRESS);
  });

  // 7. Frees driver variant and creates a completely new session with fresh plannedCardIds snapshot
  it('7. frees driver variant and creates a completely new session with fresh plannedCardIds snapshot', async () => {
    const driverId = 'driver-abandon-7';
    const variantKey = 'route-66:dir-0:hash-abandon-7';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
      },
    });

    const card = await prisma.learningCard.create({
      data: {
        progressId: progress.id,
        cardKey: 'STOP::s-fresh',
        cardType: 'STOP',
        state: CardState.NEW,
        srsLevel: 0,
      },
    });

    const oldSession = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [card.id],
        currentPromptIndex: 0,
      },
    });

    // Abandon old session
    await useCase.execute({ sessionId: oldSession.id, driverId });

    // Now starting a new session on the same variant must succeed with a new session ID
    const startResult = await startPlannedUseCase.execute({
      driverId,
      routeId: 'route-66',
      variantKey,
    });

    expect(startResult.isNew).toBe(true);
    expect(startResult.session).not.toBeNull();
    expect(startResult.session!.id).not.toBe(oldSession.id);
    expect(startResult.session!.status).toBe(SessionStatus.IN_PROGRESS);
    expect(startResult.session!.plannedCardIds).toEqual([card.id]);
  });

  // 8. Freezes currentPromptIndex at partial settlement without setting it to totalCards
  it('8. freezes currentPromptIndex at partial settlement without setting it to totalCards', async () => {
    const driverId = 'driver-abandon-8';

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: 'route-66:dir-0:hash-abandon-8',
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: ['c1', 'c2', 'c3', 'c4', 'c5'],
        currentPromptIndex: 2, // Partial settlement at index 2
        currentPromptStartedAt: new Date(),
      },
    });

    const result = await useCase.execute({ sessionId: session.id, driverId });

    expect(result.currentPromptIndex).toBe(2);
    expect(result.totalCards).toBe(5);

    const inDb = await prisma.recallSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(inDb.currentPromptIndex).toBe(2); // Must NOT be 5 or 0
    expect(inDb.status).toBe(SessionStatus.ABANDONED);
  });

  // 9a. Concurrent Abandon vs Submit: when Abandon wins lock, subsequent new Submit fails with SessionNotActiveError
  it('9a. serializes concurrent Abandon vs Submit: when Abandon wins lock, subsequent new Submit fails with SessionNotActiveError', async () => {
    const driverId = 'driver-concurrency-9a';
    const variantKey = 'route-66:dir-0:hash-concurrency-9a';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
      },
    });

    const card = await prisma.learningCard.create({
      data: {
        progressId: progress.id,
        cardKey: 'STOP::s-9a',
        cardType: 'STOP',
        state: CardState.NEW,
        srsLevel: 0,
      },
    });

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [card.id],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    // Coordination synchronization
    let signalAbandonLocked: () => void = () => {};
    const abandonLockedPromise = new Promise<void>((resolve) => {
      signalAbandonLocked = resolve;
    });

    let signalProceedAbandonCommit: () => void = () => {};
    const proceedAbandonCommitPromise = new Promise<void>((resolve) => {
      signalProceedAbandonCommit = resolve;
    });

    // Custom port wrapping real adapter that holds the lock to guarantee Abandon wins lock
    const realAdapter = new PrismaAbandonRecallSessionAdapter(prisma);
    const synchronizingAbandonPort: AbandonRecallSessionPort = {
      async runInTransaction<T>(work: (ctx: AbandonRecallSessionTxContext) => Promise<T>): Promise<T> {
        return await realAdapter.runInTransaction(async (ctx) => {
          const coordinatingCtx: AbandonRecallSessionTxContext = {
            ...ctx,
            lockSession: async (sId: string) => {
              const locked = await ctx.lockSession(sId);
              // Signal that Abandon has acquired RecallSession FOR UPDATE
              signalAbandonLocked();
              // Wait until Submit has queued up on PostgreSQL row lock
              await proceedAbandonCommitPromise;
              return locked;
            },
          };
          return await work(coordinatingCtx);
        });
      },
    };

    const coordinatingAbandonUseCase = new AbandonRecallSessionUseCase(synchronizingAbandonPort);

    // Launch Abandon (Tx A)
    const abandonPromise = coordinatingAbandonUseCase.execute({ sessionId: session.id, driverId });

    // Wait for Tx A to hold PostgreSQL row lock (or throw early if execute fails)
    await Promise.race([
      abandonLockedPromise,
      abandonPromise.then(() => {}, () => {}),
    ]);

    // Launch Submit (Tx B) - will physically block on RecallSession FOR UPDATE in PostgreSQL
    const submitPromise = submitUseCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: 'any-input',
      driverId,
    });

    // Allow a small tick so Tx B is blocked inside PostgreSQL lock wait
    await new Promise((r) => setTimeout(r, 50));

    // Release Tx A to commit ABANDONED
    signalProceedAbandonCommit();

    // Tx A must succeed
    const abandonResult = await abandonPromise;
    expect(abandonResult.status).toBe(SessionStatus.ABANDONED);

    // Tx B unblocks, sees status ABANDONED, and must throw SessionNotActiveError
    await expect(submitPromise).rejects.toThrow(SessionNotActiveError);
  });

  // 9b. Concurrent Abandon vs Submit: when final Submit wins lock, subsequent Abandon fails with CannotAbandonCompletedSessionError
  it('9b. serializes concurrent Abandon vs Submit: when final Submit wins lock, subsequent Abandon fails with CannotAbandonCompletedSessionError', async () => {
    const driverId = 'driver-concurrency-9b';
    const variantKey = 'route-66:dir-0:hash-concurrency-9b';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
      },
    });

    const card = await prisma.learningCard.create({
      data: {
        progressId: progress.id,
        cardKey: 'STOP::s-9b',
        cardType: 'STOP',
        state: CardState.NEW,
        srsLevel: 0,
      },
    });

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [card.id],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    // Coordination synchronization
    let signalSubmitLocked: () => void = () => {};
    const submitLockedPromise = new Promise<void>((resolve) => {
      signalSubmitLocked = resolve;
    });

    let signalProceedSubmitCommit: () => void = () => {};
    const proceedSubmitCommitPromise = new Promise<void>((resolve) => {
      signalProceedSubmitCommit = resolve;
    });

    // Custom port wrapping real adapter that holds the lock to guarantee Submit wins lock
    const realSubmitAdapter = new PrismaSubmitSessionAnswerAdapter(prisma);
    const synchronizingSubmitPort: SubmitSessionAnswerPort = {
      async runInTransaction<T>(work: (ctx: SubmitSessionAnswerTxContext) => Promise<T>): Promise<T> {
        return await realSubmitAdapter.runInTransaction(async (ctx) => {
          const coordinatingCtx: SubmitSessionAnswerTxContext = {
            ...ctx,
            lockSession: async (sId: string) => {
              const locked = await ctx.lockSession(sId);
              // Signal that Submit has acquired RecallSession FOR UPDATE
              signalSubmitLocked();
              // Wait until Abandon has queued up on PostgreSQL row lock
              await proceedSubmitCommitPromise;
              return locked;
            },
          };
          return await work(coordinatingCtx);
        });
      },
    };

    const coordinatingSubmitUseCase = new SubmitSessionAnswerUseCase(synchronizingSubmitPort);

    // Launch Submit (Tx A) on the final card
    const submitPromise = coordinatingSubmitUseCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: 's-9b',
      driverId,
    });

    // Wait for Tx A to hold PostgreSQL row lock
    await submitLockedPromise;

    // Launch Abandon (Tx B) - will physically block on RecallSession FOR UPDATE in PostgreSQL
    const abandonPromise = useCase.execute({
      sessionId: session.id,
      driverId,
    });
    abandonPromise.catch(() => {});

    // Allow a small tick so Tx B is blocked inside PostgreSQL lock wait
    await new Promise((r) => setTimeout(r, 50));

    // Release Tx A to complete final settlement to COMPLETED
    signalProceedSubmitCommit();

    // Tx A must succeed and transition session to COMPLETED
    const submitResult = await submitPromise;
    expect(submitResult.isSessionCompleted).toBe(true);

    // Tx B unblocks, sees status COMPLETED, and must throw CannotAbandonCompletedSessionError
    await expect(abandonPromise).rejects.toThrow(CannotAbandonCompletedSessionError);
  });
});
