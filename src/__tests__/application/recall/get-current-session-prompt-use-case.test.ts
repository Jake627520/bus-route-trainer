import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  GetCurrentSessionPromptUseCase,
  SessionNotFoundError,
  SessionOwnershipError,
  SessionNotActiveError,
} from '@/application/recall/get-current-session-prompt-use-case';
import { PrismaGetCurrentSessionPromptAdapter } from '@/infrastructure/recall/prisma-get-current-session-prompt-adapter';
import { SessionStatus } from '@/domain/recall/recall-session';
import { CardState, CardType } from '@/domain/learning/learning-card';

describe('GetCurrentSessionPromptUseCase Integration & Concurrency Tests (Change 08 Phase 4)', () => {
  const prisma = new PrismaClient();
  let useCase: GetCurrentSessionPromptUseCase;

  beforeAll(async () => {
    await prisma.$connect();
    const adapter = new PrismaGetCurrentSessionPromptAdapter(prisma);
    useCase = new GetCurrentSessionPromptUseCase(adapter);
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

  // 1. Session Not Found
  it('1. throws SessionNotFoundError when session does not exist', async () => {
    await expect(
      useCase.execute({
        sessionId: 'nonexistent-session-id',
        driverId: 'driver-1',
      }),
    ).rejects.toThrow(SessionNotFoundError);
  });

  // 2. Session Ownership Validation
  it('2. throws SessionOwnershipError when session belongs to a different driver', async () => {
    const session = await prisma.recallSession.create({
      data: {
        driverId: 'driver-owner',
        routeId: 'route-66',
        targetVariantKey: 'var-1',
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: ['card-1', 'card-2'],
        currentPromptIndex: 0,
      },
    });

    await expect(
      useCase.execute({
        sessionId: session.id,
        driverId: 'driver-intruder',
      }),
    ).rejects.toThrow(SessionOwnershipError);
  });

  // 3. Non-Active Session Rejection (COMPLETED & ABANDONED)
  it('3. throws SessionNotActiveError when session is COMPLETED or ABANDONED', async () => {
    const completedSession = await prisma.recallSession.create({
      data: {
        driverId: 'driver-1',
        routeId: 'route-66',
        targetVariantKey: 'var-1',
        status: SessionStatus.COMPLETED,
        plannedCardIds: ['card-1'],
        currentPromptIndex: 1,
        completedAt: new Date(),
      },
    });

    const abandonedSession = await prisma.recallSession.create({
      data: {
        driverId: 'driver-1',
        routeId: 'route-66',
        targetVariantKey: 'var-1',
        status: SessionStatus.ABANDONED,
        plannedCardIds: ['card-1'],
        currentPromptIndex: 0,
        abandonedAt: new Date(),
      },
    });

    await expect(
      useCase.execute({
        sessionId: completedSession.id,
        driverId: 'driver-1',
      }),
    ).rejects.toThrow(SessionNotActiveError);

    await expect(
      useCase.execute({
        sessionId: abandonedSession.id,
        driverId: 'driver-1',
      }),
    ).rejects.toThrow(SessionNotActiveError);
  });

  // 4. Dynamic Prompt Resolution from plannedCardIds snapshot
  it('4. resolves prompt dynamically corresponding to plannedCardIds[currentPromptIndex] without mutating plannedCardIds', async () => {
    const driverId = 'driver-dynamic';
    const variantKey = 'route-66:dir-0:hash-dynamic';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::1001', cardType: CardType.STOP, state: CardState.NEW },
            { cardKey: 'NEXT_STOP::1001->1002', cardType: CardType.NEXT_STOP, state: CardState.NEW },
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
      },
    });

    const result = await useCase.execute({
      sessionId: session.id,
      driverId,
    });

    expect(result.prompt).toBeDefined();
    expect(result.prompt.sessionId).toBe(session.id);
    expect(result.prompt.promptIndex).toBe(0);
    expect(result.prompt.totalCards).toBe(2);
    expect(result.prompt.cardId).toBe(cardA.id);
    expect(result.prompt.cardKey).toBe(cardA.cardKey);

    // Verify plannedCardIds snapshot is preserved in DB
    const dbSession = await prisma.recallSession.findUnique({
      where: { id: session.id },
    });
    expect(dbSession?.plannedCardIds).toEqual([cardA.id, cardB.id]);
  });

  // 5. Timer Exactly-Once Idempotent Initialization
  it('5. initializes currentPromptStartedAt exactly once and does not overwrite it on subsequent GET requests', async () => {
    const driverId = 'driver-timer';
    const variantKey = 'route-66:dir-0:hash-timer';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::2001', cardType: CardType.STOP, state: CardState.NEW },
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
        currentPromptStartedAt: null, // Timer not started initially
      },
    });

    // 1st GET -> initializes timer
    const firstResult = await useCase.execute({
      sessionId: session.id,
      driverId,
    });
    const firstStartedAt = firstResult.prompt.startedAt;
    expect(firstStartedAt).toBeInstanceOf(Date);

    // Verify DB was updated
    const sessionAfterFirst = await prisma.recallSession.findUnique({
      where: { id: session.id },
    });
    expect(sessionAfterFirst?.currentPromptStartedAt).toEqual(firstStartedAt);

    // Wait 20ms and call 2nd GET -> must return exact same startedAt
    await new Promise((r) => setTimeout(r, 20));

    const secondResult = await useCase.execute({
      sessionId: session.id,
      driverId,
    });
    expect(secondResult.prompt.startedAt.getTime()).toBe(firstStartedAt.getTime());

    // Verify DB was NOT modified with a new timestamp
    const sessionAfterSecond = await prisma.recallSession.findUnique({
      where: { id: session.id },
    });
    expect(sessionAfterSecond?.currentPromptStartedAt?.getTime()).toBe(firstStartedAt.getTime());
  });

  // 6. Concurrency: Serialized by RecallSession row lock preventing double timer initialization
  it('6. serializes concurrent GET requests under row lock so exactly one timer initialization occurs', async () => {
    const driverId = 'driver-concurrency-timer';
    const variantKey = 'route-66:dir-0:hash-concurrency-timer';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'STOP::3001', cardType: CardType.STOP, state: CardState.NEW },
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
        currentPromptStartedAt: null,
      },
    });

    // Concurrent execution
    const [res1, res2] = await Promise.all([
      useCase.execute({ sessionId: session.id, driverId }),
      useCase.execute({ sessionId: session.id, driverId }),
    ]);

    // Both must return the identical startedAt timestamp
    expect(res1.prompt.startedAt.getTime()).toBe(res2.prompt.startedAt.getTime());

    const sessionInDb = await prisma.recallSession.findUnique({
      where: { id: session.id },
    });
    expect(sessionInDb?.currentPromptStartedAt?.getTime()).toBe(res1.prompt.startedAt.getTime());
  });

  // 7. Zero SRS side-effects during Prompt Delivery
  it('7. produces zero SRS side-effects (does not mutate LearningCard or create RecallAttempt)', async () => {
    const driverId = 'driver-no-srs';
    const variantKey = 'route-66:dir-0:hash-no-srs';

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            {
              cardKey: 'STOP::4001',
              cardType: CardType.STOP,
              state: CardState.LEARNING,
              srsLevel: 2,
              repetitions: 3,
              lapses: 1,
              nextReviewAt: new Date('2026-09-12T00:00:00Z'),
            },
          ],
        },
      },
      include: { cards: true },
    });

    const cardBefore = progress.cards[0];

    const session = await prisma.recallSession.create({
      data: {
        driverId,
        routeId: 'route-66',
        targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [cardBefore.id],
        currentPromptIndex: 0,
      },
    });

    await useCase.execute({
      sessionId: session.id,
      driverId,
    });

    // Verify zero attempts created
    const attemptCount = await prisma.recallAttempt.count({
      where: { sessionId: session.id },
    });
    expect(attemptCount).toBe(0);

    // Verify LearningCard state is identical
    const cardAfter = await prisma.learningCard.findUnique({
      where: { id: cardBefore.id },
    });
    expect(cardAfter?.state).toBe(cardBefore.state);
    expect(cardAfter?.srsLevel).toBe(cardBefore.srsLevel);
    expect(cardAfter?.repetitions).toBe(cardBefore.repetitions);
    expect(cardAfter?.lapses).toBe(cardBefore.lapses);
    expect(cardAfter?.nextReviewAt?.toISOString()).toBe(cardBefore.nextReviewAt?.toISOString());
  });
});
