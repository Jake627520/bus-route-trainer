import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  StartPlannedRecallSessionUseCase,
  DriverNotEnrolledError,
} from '@/application/recall/start-planned-recall-session-use-case';
import { PrismaStartPlannedRecallSessionAdapter } from '@/infrastructure/recall/prisma-start-planned-recall-session-adapter';
import { SessionStatus } from '@/domain/recall/recall-session';
import { CardState, CardType } from '@/domain/learning/learning-card';

describe('StartPlannedRecallSessionUseCase Integration & Concurrency Tests (Change 08 Phase 3)', () => {
  const prisma = new PrismaClient();
  let useCase: StartPlannedRecallSessionUseCase;

  beforeAll(async () => {
    await prisma.$connect();
    const adapter = new PrismaStartPlannedRecallSessionAdapter(prisma);
    useCase = new StartPlannedRecallSessionUseCase(adapter);
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

  // 1. Missing DriverVariantProgress -> DriverNotEnrolledError
  it('1. throws DriverNotEnrolledError and creates zero records when driver is not enrolled', async () => {
    await expect(
      useCase.execute({
        driverId: 'driver-not-enrolled',
        routeId: 'route-66',
        variantKey: 'var-not-enrolled',
      }),
    ).rejects.toThrow(DriverNotEnrolledError);

    const sessionCount = await prisma.recallSession.count();
    const progressCount = await prisma.driverVariantProgress.count();
    expect(sessionCount).toBe(0);
    expect(progressCount).toBe(0);
  });

  // 2. Normal Start -> Creates new IN_PROGRESS session from plan with plannedCardIds
  it('2. atomically plans and creates a new IN_PROGRESS session with plannedCardIds snapshot (isNew: true)', async () => {
    const driverId = 'driver-normal';
    const variantKey = 'route-66:dir-0:hash-normal';

    await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'card-1', cardType: CardType.STOP, state: CardState.NEW },
            { cardKey: 'card-2', cardType: CardType.STOP, state: CardState.NEW },
            { cardKey: 'card-3', cardType: CardType.NEXT_STOP, state: CardState.NEW },
          ],
        },
      },
    });

    const result = await useCase.execute({
      driverId,
      routeId: 'route-66',
      variantKey,
    });

    expect(result.isNew).toBe(true);
    expect(result.session).not.toBeNull();
    expect(result.session?.driverId).toBe(driverId);
    expect(result.session?.targetVariantKey).toBe(variantKey);
    expect(result.session?.status).toBe(SessionStatus.IN_PROGRESS);
    expect(result.session?.currentPromptIndex).toBe(0);
    expect(result.session?.plannedCardIds.length).toBeGreaterThan(0);

    const dbSession = await prisma.recallSession.findUnique({
      where: { id: result.session!.id },
    });
    expect(dbSession).not.toBeNull();
    expect(dbSession?.plannedCardIds).toEqual(result.session?.plannedCardIds);
  });

  // 3. Re-entry -> Returns existing IN_PROGRESS session without creating a new plan
  it('3. returns existing active session on re-entry without re-planning (isNew: false)', async () => {
    const driverId = 'driver-reentry';
    const variantKey = 'route-66:dir-0:hash-reentry';

    await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'card-re-1', cardType: CardType.STOP, state: CardState.NEW },
          ],
        },
      },
    });

    const initialResult = await useCase.execute({
      driverId,
      routeId: 'route-66',
      variantKey,
    });
    expect(initialResult.isNew).toBe(true);

    // Call again -> re-entry
    const reEntryResult = await useCase.execute({
      driverId,
      routeId: 'route-66',
      variantKey,
    });

    expect(reEntryResult.isNew).toBe(false);
    expect(reEntryResult.session?.id).toBe(initialResult.session?.id);

    const totalSessions = await prisma.recallSession.count({
      where: { driverId, targetVariantKey: variantKey },
    });
    expect(totalSessions).toBe(1);
  });

  // 4. No eligible cards -> Returns NO_ELIGIBLE_CARDS without creating session
  it('4. returns NO_ELIGIBLE_CARDS and creates zero sessions when no cards are eligible', async () => {
    const driverId = 'driver-no-cards';
    const variantKey = 'route-66:dir-0:hash-no-cards';

    await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
      },
    });

    const result = await useCase.execute({
      driverId,
      routeId: 'route-66',
      variantKey,
    });

    expect(result.isNew).toBe(false);
    expect(result.session).toBeNull();
    expect(result.reason).toBe('NO_ELIGIBLE_CARDS');

    const sessionCount = await prisma.recallSession.count();
    expect(sessionCount).toBe(0);
  });

  // 5. Concurrent start requests -> Serialized by row lock, resulting in exactly 1 session
  it('5. serializes concurrent start requests via DriverVariantProgress row lock to prevent duplicate active sessions', async () => {
    const driverId = 'driver-concurrency';
    const variantKey = 'route-66:dir-0:hash-concurrency';

    await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-66',
        directionId: 0,
        targetVariantKey: variantKey,
        cards: {
          create: [
            { cardKey: 'c-1', cardType: CardType.STOP, state: CardState.NEW },
            { cardKey: 'c-2', cardType: CardType.STOP, state: CardState.NEW },
          ],
        },
      },
    });

    const command = {
      driverId,
      routeId: 'route-66',
      variantKey,
    };

    // Trigger two concurrent start executions
    const [res1, res2] = await Promise.all([
      useCase.execute(command),
      useCase.execute(command),
    ]);

    // Exactly one must be new, and one must be re-entry
    const isNewCount = (res1.isNew ? 1 : 0) + (res2.isNew ? 1 : 0);
    expect(isNewCount).toBe(1);

    // Both must refer to the identical session ID
    expect(res1.session?.id).toBe(res2.session?.id);

    // In DB, only 1 active session exists
    const activeSessionsInDb = await prisma.recallSession.count({
      where: { driverId, targetVariantKey: variantKey, status: SessionStatus.IN_PROGRESS },
    });
    expect(activeSessionsInDb).toBe(1);
  });
});
