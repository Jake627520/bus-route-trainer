import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  SubmitSessionAnswerUseCase,
  SessionNotFoundError,
  SessionOwnershipError,
  SessionNotActiveError,
  PromptIndexMismatchError,
  IdempotencyConflictError,
} from '@/application/recall/submit-session-answer-use-case';
import { PrismaSubmitSessionAnswerAdapter } from '@/infrastructure/recall/prisma-submit-session-answer-adapter';
import {
  SubmitSessionAnswerPort,
  SubmitSessionAnswerTxContext,
} from '@/application/recall/submit-session-answer-port';
import { SessionStatus, RecallOutcome, RecallMode } from '@/domain/recall/recall-session';
import { CardState, CardType } from '@/domain/learning/learning-card';

describe('SubmitSessionAnswerUseCase Integration & Concurrency Tests (Change 08 Phase 5)', () => {
  const prisma = new PrismaClient();
  let useCase: SubmitSessionAnswerUseCase;

  beforeAll(async () => {
    await prisma.$connect();
    const adapter = new PrismaSubmitSessionAnswerAdapter(prisma);
    useCase = new SubmitSessionAnswerUseCase(adapter);
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

  // 1. Normal PASS Settlement
  it('1. evaluates answer to PASS, advances SRS state, records attempt snapshot, advances session cursor, and clears currentPromptStartedAt', async () => {
    const driverId = 'driver-pass';
    const variantKey = 'route-66:dir-0:hash-pass';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::101', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
            { cardKey: 'STOP::102', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
          ],
        },
      },
      include: { cards: true },
    });

    const cardA = progress.cards[0];
    const cardB = progress.cards[1];

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [cardA.id, cardB.id],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    const result = await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: '101',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });

    expect(result.outcome).toBe(RecallOutcome.PASS);
    expect(result.promptIndex).toBe(0);
    expect(result.isSessionCompleted).toBe(false);
    expect(result.isDuplicate).toBe(false);
    expect(result.resultingState).toBe(CardState.LEARNING);
    expect(result.resultingSrsLevel).toBe(1);

    // Verify session advanced in DB
    const dbSession = await prisma.recallSession.findUnique({
      where: { id: session.id },
    });
    expect(dbSession?.currentPromptIndex).toBe(1);
    expect(dbSession?.currentPromptStartedAt).toBeNull();
    expect(dbSession?.status).toBe(SessionStatus.IN_PROGRESS);

    // Verify card SRS state updated in DB
    const dbCard = await prisma.learningCard.findUnique({
      where: { id: cardA.id },
    });
    expect(dbCard?.state).toBe(CardState.LEARNING);
    expect(dbCard?.srsLevel).toBe(1);

    // Verify attempt recorded in DB with resulting snapshot
    const dbAttempt = await prisma.recallAttempt.findUnique({
      where: {
        sessionId_promptIndex: {
          sessionId: session.id,
          promptIndex: 0,
        },
      },
    });
    expect(dbAttempt).not.toBeNull();
    expect(dbAttempt?.outcome).toBe('PASS');
    expect(dbAttempt?.rawInput).toBe('101');
    expect(dbAttempt?.resultingState).toBe('LEARNING');
    expect(dbAttempt?.resultingSrsLevel).toBe(1);
  });

  // 2. Normal FAIL Settlement
  it('2. evaluates incorrect answer to FAIL, resets SRS level, increments lapses, and advances session cursor', async () => {
    const driverId = 'driver-fail';
    const variantKey = 'route-66:dir-0:hash-fail';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::201', cardType: CardType.STOP, state: CardState.REVIEW, srsLevel: 3, lapses: 0 },
            { cardKey: 'STOP::202', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
          ],
        },
      },
      include: { cards: true },
    });

    const cardA = progress.cards[0];
    const cardB = progress.cards[1];

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [cardA.id, cardB.id],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    const result = await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: 'wrong-answer',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });

    expect(result.outcome).toBe(RecallOutcome.FAIL);
    expect(result.promptIndex).toBe(0);
    expect(result.isSessionCompleted).toBe(false);
    expect(result.resultingState).toBe(CardState.REVIEW);
    expect(result.resultingSrsLevel).toBe(0);

    const dbCard = await prisma.learningCard.findUnique({
      where: { id: cardA.id },
    });
    expect(dbCard?.srsLevel).toBe(0);
    expect(dbCard?.lapses).toBe(1);
  });

  // 3. Final Card Settlement -> Transitions to COMPLETED
  it('3. transitions session to COMPLETED when final prompt is answered', async () => {
    const driverId = 'driver-final';
    const variantKey = 'route-66:dir-0:hash-final';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::301', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
          ],
        },
      },
      include: { cards: true },
    });

    const card = progress.cards[0];

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

    const result = await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: '301',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });

    expect(result.isSessionCompleted).toBe(true);

    const dbSession = await prisma.recallSession.findUnique({
      where: { id: session.id },
    });
    expect(dbSession?.status).toBe(SessionStatus.COMPLETED);
    expect(dbSession?.completedAt).not.toBeNull();
    expect(dbSession?.currentPromptIndex).toBe(1);
  });

  // 4. Duplicate Submission -> Idempotent Replay (Zero SRS re-execution)
  it('4. replays cached snapshot and skips SRS execution on exact duplicate submission', async () => {
    const driverId = 'driver-replay';
    const variantKey = 'route-66:dir-0:hash-replay';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::401', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
            { cardKey: 'STOP::402', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
          ],
        },
      },
      include: { cards: true },
    });

    const cardA = progress.cards[0];
    const cardB = progress.cards[1];

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [cardA.id, cardB.id],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    // 1st submission
    const res1 = await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: '401',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });
    expect(res1.isDuplicate).toBe(false);

    // Record card state after 1st submission
    const cardAfterFirst = await prisma.learningCard.findUnique({
      where: { id: cardA.id },
    });

    // 2nd submission with identical identity
    const res2 = await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: '401',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });

    expect(res2.isDuplicate).toBe(true);
    expect(res2.outcome).toBe(res1.outcome);
    expect(res2.resultingState).toBe(res1.resultingState);
    expect(res2.resultingSrsLevel).toBe(res1.resultingSrsLevel);

    // Verify card was NOT re-evaluated or mutated
    const cardAfterSecond = await prisma.learningCard.findUnique({
      where: { id: cardA.id },
    });
    expect(cardAfterSecond?.repetitions).toBe(cardAfterFirst?.repetitions);
    expect(cardAfterSecond?.srsLevel).toBe(cardAfterFirst?.srsLevel);

    // Session cursor did NOT advance again
    const sessionAfterSecond = await prisma.recallSession.findUnique({
      where: { id: session.id },
    });
    expect(sessionAfterSecond?.currentPromptIndex).toBe(1);
  });

  // 5. Duplicate Replay on COMPLETED Session (Attempt Precedence)
  it('5. replays cached snapshot on COMPLETED session without throwing SessionNotActiveError', async () => {
    const driverId = 'driver-replay-completed';
    const variantKey = 'route-66:dir-0:hash-replay-completed';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::501', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
          ],
        },
      },
      include: { cards: true },
    });

    const card = progress.cards[0];

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

    // Submit -> session completes
    await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: '501',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });

    // Replay on COMPLETED session
    const replayResult = await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: '501',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });

    expect(replayResult.isDuplicate).toBe(true);
    expect(replayResult.isSessionCompleted).toBe(true);
  });

  // 6. Duplicate Replay on ABANDONED Session (Attempt Precedence)
  it('6. replays cached snapshot on ABANDONED session without throwing SessionNotActiveError', async () => {
    const driverId = 'driver-replay-abandoned';
    const variantKey = 'route-66:dir-0:hash-replay-abandoned';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::601', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
            { cardKey: 'STOP::602', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
          ],
        },
      },
      include: { cards: true },
    });

    const cardA = progress.cards[0];
    const cardB = progress.cards[1];

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [cardA.id, cardB.id],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    // Submit first card
    await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: '601',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });

    // Abandon session
    await prisma.recallSession.update({
      where: { id: session.id },
      data: { status: SessionStatus.ABANDONED, abandonedAt: new Date() },
    });

    // Replay prompt 0 on ABANDONED session -> succeeds via Attempt Precedence
    const replayResult = await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: '601',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });

    expect(replayResult.isDuplicate).toBe(true);
  });

  // 7. Conflicting Submission -> IdempotencyConflictError
  it('7. throws IdempotencyConflictError when submitting different input for already settled prompt', async () => {
    const driverId = 'driver-conflict';
    const variantKey = 'route-66:dir-0:hash-conflict';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::701', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
            { cardKey: 'STOP::702', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
          ],
        },
      },
      include: { cards: true },
    });

    const cardA = progress.cards[0];
    const cardB = progress.cards[1];

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [cardA.id, cardB.id],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    // 1st submission
    await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: '701',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });

    // 2nd submission with DIFFERENT input
    await expect(
      useCase.execute({
        sessionId: session.id,
        promptIndex: 0,
        rawInput: 'different-answer',
        recallMode: RecallMode.STOP_NAME_RECOGNITION,
        driverId,
      }),
    ).rejects.toThrow(IdempotencyConflictError);
  });

  // 8. Out-of-Order PromptIndex Rejection
  it('8. throws PromptIndexMismatchError when submitted promptIndex does not match currentPromptIndex', async () => {
    const driverId = 'driver-mismatch';
    const variantKey = 'route-66:dir-0:hash-mismatch';

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: ['card-1', 'card-2'],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    await expect(
      useCase.execute({
        sessionId: session.id,
        promptIndex: 2, // Mismatch
        rawInput: 'answer',
        driverId,
      }),
    ).rejects.toThrow(PromptIndexMismatchError);
  });

  // 9. Ownership Validation
  it('9. throws SessionOwnershipError when session belongs to a different driver', async () => {
    const session = await prisma.recallSession.create({
      data: {
        driverId: 'driver-owner',
        routeId: 'route-66',
        targetVariantKey: 'var-1',
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: ['card-1'],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    await expect(
      useCase.execute({
        sessionId: session.id,
        promptIndex: 0,
        rawInput: 'answer',
        driverId: 'driver-stranger',
      }),
    ).rejects.toThrow(SessionOwnershipError);
  });

  // 10. Session Not Active on Unsettled Prompt
  it('10. throws SessionNotActiveError when submitting an unsettled prompt on a COMPLETED or ABANDONED session', async () => {
    const completedSession = await prisma.recallSession.create({
      data: {
        driverId: 'driver-1',
        routeId: 'route-66',
        targetVariantKey: 'var-1',
        status: SessionStatus.COMPLETED,
        plannedCardIds: ['card-1', 'card-2'],
        currentPromptIndex: 2,
        completedAt: new Date(),
      },
    });

    await expect(
      useCase.execute({
        sessionId: completedSession.id,
        promptIndex: 1, // Unsettled prompt on completed session
        rawInput: 'answer',
        driverId: 'driver-1',
      }),
    ).rejects.toThrow(SessionNotActiveError);
  });

  // 11. Session Not Found
  it('11. throws SessionNotFoundError when session does not exist', async () => {
    await expect(
      useCase.execute({
        sessionId: 'nonexistent-session-id',
        promptIndex: 0,
        rawInput: 'answer',
        driverId: 'driver-1',
      }),
    ).rejects.toThrow(SessionNotFoundError);
  });

  // 12. Concurrency: Two simultaneous submits serialized by row lock (1 settles, 1 replays)
  it('12. serializes concurrent submissions via RecallSession FOR UPDATE so exactly one settlement executes and the second replays', async () => {
    const driverId = 'driver-concurrency-submit';
    const variantKey = 'route-66:dir-0:hash-concurrency-submit';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::901', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
            { cardKey: 'STOP::902', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
          ],
        },
      },
      include: { cards: true },
    });

    const cardA = progress.cards[0];
    const cardB = progress.cards[1];

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [cardA.id, cardB.id],
        currentPromptIndex: 0,
        currentPromptStartedAt: new Date(),
      },
    });

    const command = {
      sessionId: session.id,
      promptIndex: 0,
      rawInput: '901',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    };

    // Run two identical submissions concurrently
    const [res1, res2] = await Promise.all([
      useCase.execute(command),
      useCase.execute(command),
    ]);

    // One must be new submission (isDuplicate: false), one must be replay (isDuplicate: true)
    const duplicateCount = (res1.isDuplicate ? 1 : 0) + (res2.isDuplicate ? 1 : 0);
    expect(duplicateCount).toBe(1);

    // Both must agree on outcome and resulting state
    expect(res1.outcome).toBe(res2.outcome);
    expect(res1.resultingState).toBe(res2.resultingState);
    expect(res1.resultingSrsLevel).toBe(res2.resultingSrsLevel);

    // DB: exactly 1 attempt exists
    const attemptsInDb = await prisma.recallAttempt.count({
      where: { sessionId: session.id },
    });
    expect(attemptsInDb).toBe(1);

    // DB: session advanced to index 1 (not 2!)
    const sessionInDb = await prisma.recallSession.findUnique({
      where: { id: session.id },
    });
    expect(sessionInDb?.currentPromptIndex).toBe(1);

    // DB: card repetitions incremented exactly once (0 -> 1)
    const cardInDb = await prisma.learningCard.findUnique({
      where: { id: cardA.id },
    });
    expect(cardInDb?.repetitions).toBe(1);
  });

  // 13. Atomic Rollback on Failure
  it('13. completely rolls back all modifications (Attempt, Card, Session) if any error occurs before transaction commit', async () => {
    const driverId = 'driver-rollback';
    const variantKey = 'route-66:dir-0:hash-rollback';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::rollback-1', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
          ],
        },
      },
      include: { cards: true },
    });

    const card = progress.cards[0];

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

    // Adapter that fails on advanceSession inside the real transaction
    const realAdapter = new PrismaSubmitSessionAnswerAdapter(prisma);
    const failingPort: SubmitSessionAnswerPort = {
      async runInTransaction<T>(work: (ctx: SubmitSessionAnswerTxContext) => Promise<T>): Promise<T> {
        return await realAdapter.runInTransaction(async (ctx) => {
          const failingCtx: SubmitSessionAnswerTxContext = {
            ...ctx,
            advanceSession: async () => {
              // Injected failure after attempt creation & card update
              throw new Error('Simulated crash during advanceSession');
            },
          };
          return await work(failingCtx);
        });
      },
    };

    const failingUseCase = new SubmitSessionAnswerUseCase(failingPort);

    await expect(
      failingUseCase.execute({
        sessionId: session.id,
        promptIndex: 0,
        rawInput: 'rollback-1',
        driverId,
      }),
    ).rejects.toThrow('Simulated crash during advanceSession');

    // VERIFY ZERO COMMITS in PostgreSQL
    const attemptsCount = await prisma.recallAttempt.count({ where: { sessionId: session.id } });
    expect(attemptsCount).toBe(0);

    const cardInDb = await prisma.learningCard.findUnique({ where: { id: card.id } });
    expect(cardInDb?.state).toBe(CardState.NEW);
    expect(cardInDb?.srsLevel).toBe(0);

    const sessionInDb = await prisma.recallSession.findUnique({ where: { id: session.id } });
    expect(sessionInDb?.currentPromptIndex).toBe(0);
    expect(sessionInDb?.status).toBe(SessionStatus.IN_PROGRESS);
  });

  // 14. StartedAt & Duration Propagation from currentPromptStartedAt
  it('14. correctly uses session.currentPromptStartedAt for RecallAttempt.startedAt and calculates positive durationMs', async () => {
    const driverId = 'driver-duration';
    const variantKey = 'route-66:dir-0:hash-duration';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::duration-1', cardType: CardType.STOP, state: CardState.NEW, srsLevel: 0 },
          ],
        },
      },
      include: { cards: true },
    });

    const card = progress.cards[0];
    const promptStartedAt = new Date(Date.now() - 4000); // Prompt started 4 seconds ago

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [card.id],
        currentPromptIndex: 0,
        currentPromptStartedAt: promptStartedAt,
      },
    });

    await useCase.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: 'duration-1',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      driverId,
    });

    const attempt = await prisma.recallAttempt.findUnique({
      where: { sessionId_promptIndex: { sessionId: session.id, promptIndex: 0 } },
    });

    expect(attempt).not.toBeNull();
    expect(attempt?.startedAt.getTime()).toBe(promptStartedAt.getTime());
    expect(attempt!.durationMs).toBeGreaterThanOrEqual(3900);
  });
});
