import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ImportGtfsUseCase } from '@/application/gtfs/import-gtfs-use-case';
import { PrismaGtfsRepository } from '@/infrastructure/gtfs/importer/prisma-gtfs-repository';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { EnrollVariantUseCase } from '@/application/learning/enroll-variant-use-case';
import { PrismaDueLearningCardsRepository } from '@/infrastructure/learning/prisma-due-learning-cards-repository';
import { CardState, CardType, LearningCard } from '@/domain/learning/learning-card';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

describe('Change 07 Phase 4: PrismaDueLearningCardsRepository (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const writeRepo = new PrismaGtfsRepository(prisma);
  const readRepo = new PrismaGtfsReadRepository(prisma);
  const importer = new ImportGtfsUseCase(writeRepo);
  const getRouteVariantsUseCase = new GetRouteVariantsUseCase(readRepo);

  const learningRepo = new PrismaLearningProgressRepository(prisma);
  const enrollUseCase = new EnrollVariantUseCase(learningRepo, getRouteVariantsUseCase);

  const dueCardsRepo = new PrismaDueLearningCardsRepository(prisma);

  const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures/gtfs');
  const validFeedDir = path.join(fixturesDir, 'valid-feed');

  let targetVariantKey: string;
  let routeId: string;
  let progressId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Clean tables
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendarDate.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();

    // Import GTFS valid feed
    await importer.execute(validFeedDir);

    const routes = await readRepo.findAllRoutes();
    routeId = routes[0].id;
    const variants = await getRouteVariantsUseCase.execute(routeId);
    targetVariantKey = variants[0].variantKey;
  });

  beforeEach(async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();

    const result = await enrollUseCase.execute({
      driverId: DEFAULT_DRIVER_ID,
      routeId,
      variantKey: targetVariantKey,
    });
    progressId = result.progress.id;
  });

  afterAll(async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.$disconnect();
  });

  it('(1) filters overdue and due cards while strictly excluding future and NEW (null) cards', async () => {
    const now = new Date('2026-09-11T10:00:00.000Z');
    const pastOverdue = new Date('2026-09-11T08:00:00.000Z');
    const exactDue = new Date('2026-09-11T10:00:00.000Z');
    const futureNotDue = new Date('2026-09-11T12:00:00.000Z');

    const cards = await prisma.learningCard.findMany({ where: { progressId } });
    expect(cards.length).toBeGreaterThanOrEqual(4);

    // Card 0: Overdue
    await prisma.learningCard.update({
      where: { id: cards[0].id },
      data: { state: CardState.REVIEW, srsLevel: 2, nextReviewAt: pastOverdue },
    });
    // Card 1: Exactly due
    await prisma.learningCard.update({
      where: { id: cards[1].id },
      data: { state: CardState.LEARNING, srsLevel: 1, nextReviewAt: exactDue },
    });
    // Card 2: Future (not due)
    await prisma.learningCard.update({
      where: { id: cards[2].id },
      data: { state: CardState.REVIEW, srsLevel: 3, nextReviewAt: futureNotDue },
    });
    // Card 3: NEW (nextReviewAt is null)
    await prisma.learningCard.update({
      where: { id: cards[3].id },
      data: { state: CardState.NEW, srsLevel: 0, nextReviewAt: null },
    });

    const dueCards = await dueCardsRepo.findDueCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
      now,
    });

    expect(dueCards).toHaveLength(2);
    const dueIds = dueCards.map((c) => c.id);
    expect(dueIds).toContain(cards[0].id);
    expect(dueIds).toContain(cards[1].id);
    expect(dueIds).not.toContain(cards[2].id);
    expect(dueIds).not.toContain(cards[3].id);
  });

  it('(2) enforces exact millisecond boundaries (<= now is due, now + 1ms is not due, now - 1ms is due)', async () => {
    const now = new Date('2026-09-11T10:00:00.000Z');
    const minus1ms = new Date('2026-09-11T09:59:59.999Z');
    const exactNow = new Date('2026-09-11T10:00:00.000Z');
    const plus1ms = new Date('2026-09-11T10:00:00.001Z');

    const cards = await prisma.learningCard.findMany({ where: { progressId } });

    await prisma.learningCard.update({
      where: { id: cards[0].id },
      data: { state: CardState.REVIEW, srsLevel: 1, nextReviewAt: minus1ms },
    });
    await prisma.learningCard.update({
      where: { id: cards[1].id },
      data: { state: CardState.REVIEW, srsLevel: 2, nextReviewAt: exactNow },
    });
    await prisma.learningCard.update({
      where: { id: cards[2].id },
      data: { state: CardState.REVIEW, srsLevel: 3, nextReviewAt: plus1ms },
    });

    const dueCards = await dueCardsRepo.findDueCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
      now,
    });

    const dueIds = dueCards.map((c) => c.id);
    expect(dueIds).toContain(cards[0].id); // minus1ms
    expect(dueIds).toContain(cards[1].id); // exactNow
    expect(dueIds).not.toContain(cards[2].id); // plus1ms
  });

  it('(3) enforces deterministic ordering by nextReviewAt ASC, id ASC as tie-breaker', async () => {
    const now = new Date('2026-09-11T10:00:00.000Z');
    const timeA = new Date('2026-09-11T08:00:00.000Z');
    const timeB = new Date('2026-09-11T09:00:00.000Z'); // Identical timestamp for two cards

    const cards = await prisma.learningCard.findMany({
      where: { progressId },
      take: 3,
    });

    // Card 0: Earlier timeA
    await prisma.learningCard.update({
      where: { id: cards[0].id },
      data: { state: CardState.REVIEW, srsLevel: 1, nextReviewAt: timeA },
    });

    // Cards 1 and 2: Identical timestamp timeB
    await prisma.learningCard.update({
      where: { id: cards[1].id },
      data: { state: CardState.REVIEW, srsLevel: 2, nextReviewAt: timeB },
    });
    await prisma.learningCard.update({
      where: { id: cards[2].id },
      data: { state: CardState.REVIEW, srsLevel: 3, nextReviewAt: timeB },
    });

    const dueCards = await dueCardsRepo.findDueCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
      now,
    });

    // First card must be cards[0] (earliest timestamp)
    expect(dueCards[0].id).toBe(cards[0].id);

    // Cards 1 and 2 share timeB -> must be ordered deterministically by id ASC
    const expectedTieBreaker = [cards[1].id, cards[2].id].sort();
    expect(dueCards[1].id).toBe(expectedTieBreaker[0]);
    expect(dueCards[2].id).toBe(expectedTieBreaker[1]);
  });

  it('(4) respects limit parameter semantics (positive, undefined, 0, negative)', async () => {
    const now = new Date('2026-09-11T10:00:00.000Z');
    const cards = await prisma.learningCard.findMany({ where: { progressId } });

    // Mark 3 cards as due
    for (let i = 0; i < 3; i++) {
      await prisma.learningCard.update({
        where: { id: cards[i].id },
        data: {
          state: CardState.REVIEW,
          srsLevel: i + 1,
          nextReviewAt: new Date(now.getTime() - (3 - i) * 60000), // 3m, 2m, 1m ago
        },
      });
    }

    // 4a. Undefined limit -> returns all 3 due cards
    const unlimited = await dueCardsRepo.findDueCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
      now,
    });
    expect(unlimited).toHaveLength(3);

    // 4b. Positive limit (limit: 2) -> returns first 2 in order
    const limited = await dueCardsRepo.findDueCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
      now,
      limit: 2,
    });
    expect(limited).toHaveLength(2);
    expect(limited[0].id).toBe(unlimited[0].id);
    expect(limited[1].id).toBe(unlimited[1].id);

    // 4c. Limit = 0 -> returns []
    const zeroLimit = await dueCardsRepo.findDueCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
      now,
      limit: 0,
    });
    expect(zeroLimit).toEqual([]);

    // 4d. Negative limit (limit: -5) -> returns []
    const negativeLimit = await dueCardsRepo.findDueCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
      now,
      limit: -5,
    });
    expect(negativeLimit).toEqual([]);
  });

  it('(5) returns empty array when driver or variant is not enrolled', async () => {
    const now = new Date('2026-09-11T10:00:00.000Z');

    // Unknown driver
    const unknownDriverRes = await dueCardsRepo.findDueCards({
      driverId: 'NON_EXISTENT_DRIVER_ID',
      variantKey: targetVariantKey,
      now,
    });
    expect(unknownDriverRes).toEqual([]);

    // Unknown variant
    const unknownVariantRes = await dueCardsRepo.findDueCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: 'NON_EXISTENT_VARIANT_KEY',
      now,
    });
    expect(unknownVariantRes).toEqual([]);
  });

  it('(6) maps complete LearningCard domain entity accurately including srsLevel', async () => {
    const now = new Date('2026-09-11T10:00:00.000Z');
    const scheduledTime = new Date('2026-09-11T09:30:00.000Z');

    const card = await prisma.learningCard.findFirst({ where: { progressId } });
    expect(card).not.toBeNull();

    await prisma.learningCard.update({
      where: { id: card!.id },
      data: {
        state: CardState.REVIEW,
        srsLevel: 4,
        nextReviewAt: scheduledTime,
        repetitions: 12,
        lapses: 2,
      },
    });

    const dueCards = await dueCardsRepo.findDueCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
      now,
    });

    const target = dueCards.find((c) => c.id === card!.id);
    expect(target).toBeDefined();
    expect(target).toBeInstanceOf(LearningCard);
    expect(target!.id).toBe(card!.id);
    expect(target!.progressId).toBe(progressId);
    expect(target!.cardKey).toBe(card!.cardKey);
    expect(target!.cardType).toBe(card!.cardType as CardType);
    expect(target!.state).toBe(CardState.REVIEW);
    expect(target!.srsLevel).toBe(4);
    expect(target!.repetitions).toBe(12);
    expect(target!.lapses).toBe(2);
    expect(target!.nextReviewAt?.toISOString()).toBe(scheduledTime.toISOString());
  });
});
