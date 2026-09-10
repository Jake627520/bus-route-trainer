import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import {
  DriverVariantProgress,
  ProgressStatus,
} from '@/domain/learning/driver-variant-progress';
import { LearningCard, CardType, CardState } from '@/domain/learning/learning-card';

describe('PrismaLearningProgressRepository Integration Tests', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaLearningProgressRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
  });

  it('atomically persists progress with cards and retrieves by (driverId, variantKey)', async () => {
    const progressId = 'prog_1001';
    const card1 = new LearningCard({
      id: 'card_1001',
      progressId,
      cardKey: 'STOP::place_rbwh',
      cardType: CardType.STOP,
      state: CardState.NEW,
    });
    const card2 = new LearningCard({
      id: 'card_1002',
      progressId,
      cardKey: 'NEXT_STOP::place_rbwh->place_king_george',
      cardType: CardType.NEXT_STOP,
      state: CardState.NEW,
    });

    const progress = new DriverVariantProgress({
      id: progressId,
      driverId: 'driver_default_local',
      routeId: 'R66',
      directionId: 0,
      targetVariantKey: 'R66_DIR0_place_rbwh>place_king_george',
      status: ProgressStatus.NOT_STARTED,
      cards: [card1, card2],
    });

    await repository.saveProgressWithCards(progress);

    const retrieved = await repository.findByDriverAndVariant(
      'driver_default_local',
      'R66_DIR0_place_rbwh>place_king_george'
    );

    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(progressId);
    expect(retrieved!.driverId).toBe('driver_default_local');
    expect(retrieved!.cards).toHaveLength(2);
    expect(retrieved!.cards.map((c) => c.cardKey)).toEqual([
      'STOP::place_rbwh',
      'NEXT_STOP::place_rbwh->place_king_george',
    ]);
  });

  it('atomic transaction rollback: forced failure during card insertion leaves ZERO progress and ZERO cards in DB', async () => {
    const progressId = 'prog_rollback';
    // Two cards with identical cardKey within the same progress will violate @@unique([progressId, cardKey])
    const card1 = new LearningCard({
      id: 'card_r1',
      progressId,
      cardKey: 'STOP::duplicate_key',
      cardType: CardType.STOP,
    });
    const card2 = new LearningCard({
      id: 'card_r2',
      progressId,
      cardKey: 'STOP::duplicate_key', // Duplicate within same progress!
      cardType: CardType.STOP,
    });

    const progress = new DriverVariantProgress({
      id: progressId,
      driverId: 'driver_1',
      routeId: 'R100',
      directionId: 1,
      targetVariantKey: 'R100_DIR1_dup',
      cards: [card1, card2],
    });

    // saveProgressWithCards must reject due to the unique constraint violation
    await expect(repository.saveProgressWithCards(progress)).rejects.toThrow();

    // Verify 100% rollback: progress was NOT persisted
    const progressInDb = await prisma.driverVariantProgress.findUnique({
      where: { id: progressId },
    });
    expect(progressInDb).toBeNull();

    // Verify 100% rollback: zero cards remained
    const cardsInDb = await prisma.learningCard.findMany({
      where: { progressId },
    });
    expect(cardsInDb).toHaveLength(0);
  });

  it('enforces composite uniqueness: unique([driverId, targetVariantKey]) and unique([progressId, cardKey])', async () => {
    const progress1 = new DriverVariantProgress({
      id: 'prog_u1',
      driverId: 'driver_alice',
      routeId: 'R66',
      directionId: 0,
      targetVariantKey: 'R66_DIR0_common',
      cards: [
        new LearningCard({
          id: 'card_u1',
          progressId: 'prog_u1',
          cardKey: 'STOP::common_stop',
          cardType: CardType.STOP,
        }),
      ],
    });
    await repository.saveProgressWithCards(progress1);

    // 1. Attempting to insert duplicate (driverId, targetVariantKey) must reject
    const duplicateProgress = new DriverVariantProgress({
      id: 'prog_u2',
      driverId: 'driver_alice', // Same driver
      routeId: 'R66',
      directionId: 0,
      targetVariantKey: 'R66_DIR0_common', // Same variantKey
      cards: [],
    });
    await expect(repository.saveProgressWithCards(duplicateProgress)).rejects.toThrow();

    // 2. Different progress records CAN have identical cardKey (STOP::common_stop)
    const progress2 = new DriverVariantProgress({
      id: 'prog_u3',
      driverId: 'driver_alice',
      routeId: 'R66',
      directionId: 1, // Different variantKey
      targetVariantKey: 'R66_DIR1_different',
      cards: [
        new LearningCard({
          id: 'card_u2',
          progressId: 'prog_u3',
          cardKey: 'STOP::common_stop', // Identical cardKey in different progress!
          cardType: CardType.STOP,
        }),
      ],
    });
    // Must succeed without collision!
    await expect(repository.saveProgressWithCards(progress2)).resolves.not.toThrow();
  });

  it('cross-driver data isolation: Alice and Bob enroll in the same variant independently', async () => {
    const variantKey = 'R66_DIR0_shared_variant';

    const aliceProgress = new DriverVariantProgress({
      id: 'prog_alice',
      driverId: 'driver_alice',
      routeId: 'R66',
      directionId: 0,
      targetVariantKey: variantKey,
      cards: [
        new LearningCard({
          id: 'card_alice_1',
          progressId: 'prog_alice',
          cardKey: 'STOP::stop_1',
          cardType: CardType.STOP,
        }),
      ],
    });

    const bobProgress = new DriverVariantProgress({
      id: 'prog_bob',
      driverId: 'driver_bob',
      routeId: 'R66',
      directionId: 0,
      targetVariantKey: variantKey,
      cards: [
        new LearningCard({
          id: 'card_bob_1',
          progressId: 'prog_bob',
          cardKey: 'STOP::stop_1',
          cardType: CardType.STOP,
        }),
      ],
    });

    await repository.saveProgressWithCards(aliceProgress);
    await repository.saveProgressWithCards(bobProgress);

    const aliceResult = await repository.findByDriverAndVariant('driver_alice', variantKey);
    const bobResult = await repository.findByDriverAndVariant('driver_bob', variantKey);

    expect(aliceResult).not.toBeNull();
    expect(bobResult).not.toBeNull();
    expect(aliceResult!.id).toBe('prog_alice');
    expect(bobResult!.id).toBe('prog_bob');
    expect(aliceResult!.cards[0].id).toBe('card_alice_1');
    expect(bobResult!.cards[0].id).toBe('card_bob_1');
  });

  it('cascade deletion: deleting a progress record deletes all associated learning cards', async () => {
    const progressId = 'prog_cascade';
    const progress = new DriverVariantProgress({
      id: progressId,
      driverId: 'driver_1',
      routeId: 'R66',
      directionId: 0,
      targetVariantKey: 'R66_DIR0_cascade',
      cards: [
        new LearningCard({
          id: 'card_c1',
          progressId,
          cardKey: 'STOP::s1',
          cardType: CardType.STOP,
        }),
      ],
    });
    await repository.saveProgressWithCards(progress);

    // Delete parent progress
    await prisma.driverVariantProgress.delete({ where: { id: progressId } });

    // Verify card was automatically cascaded
    const cards = await prisma.learningCard.findMany({ where: { progressId } });
    expect(cards).toHaveLength(0);
  });

  it('GTFS table independence: purging GTFS transport tables leaves learning progress and cards intact', async () => {
    const progressId = 'prog_gtfs_independent';
    const progress = new DriverVariantProgress({
      id: progressId,
      driverId: 'driver_1',
      routeId: 'R66',
      directionId: 0,
      targetVariantKey: 'R66_DIR0_any',
      cards: [
        new LearningCard({
          id: 'card_g1',
          progressId,
          cardKey: 'STOP::s_indep',
          cardType: CardType.STOP,
        }),
      ],
    });
    await repository.saveProgressWithCards(progress);

    // Purge GTFS tables
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();

    // Verify learning progress and cards are 100% intact
    const found = await repository.findByDriverAndVariant('driver_1', 'R66_DIR0_any');
    expect(found).not.toBeNull();
    expect(found!.id).toBe(progressId);
    expect(found!.cards).toHaveLength(1);
  });
});
