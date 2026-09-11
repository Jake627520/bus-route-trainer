import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ImportGtfsUseCase } from '@/application/gtfs/import-gtfs-use-case';
import { PrismaGtfsRepository } from '@/infrastructure/gtfs/importer/prisma-gtfs-repository';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { EnrollVariantUseCase } from '@/application/learning/enroll-variant-use-case';
import { PrismaNewLearningCardsRepository } from '@/infrastructure/learning/prisma-new-learning-cards-repository';
import { CardState } from '@/domain/learning/learning-card';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

describe('Change 07 Phase 6: PrismaNewLearningCardsRepository (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const writeRepo = new PrismaGtfsRepository(prisma);
  const readRepo = new PrismaGtfsReadRepository(prisma);
  const importer = new ImportGtfsUseCase(writeRepo);
  const getRouteVariantsUseCase = new GetRouteVariantsUseCase(readRepo);

  const learningRepo = new PrismaLearningProgressRepository(prisma);
  const enrollUseCase = new EnrollVariantUseCase(learningRepo, getRouteVariantsUseCase);

  const newCardsRepo = new PrismaNewLearningCardsRepository(prisma);

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

  it('(1) fetches only cards in state NEW with nextReviewAt null', async () => {
    // When enrolled, all cards default to NEW and nextReviewAt: null
    const newCards = await newCardsRepo.findNewCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
    });

    expect(newCards.length).toBeGreaterThan(0);
    for (const card of newCards) {
      expect(card.state).toBe(CardState.NEW);
      expect(card.nextReviewAt).toBeNull();
    }
  });

  it('(2) strictly excludes cards in state REVIEW or cards having a scheduled nextReviewAt', async () => {
    const allCards = await prisma.learningCard.findMany({
      where: { progressId },
      orderBy: { id: 'asc' },
    });

    // Move card 0 to REVIEW with nextReviewAt scheduled
    await prisma.learningCard.update({
      where: { id: allCards[0].id },
      data: {
        state: 'REVIEW',
        nextReviewAt: new Date(),
      },
    });

    // Keep card 1 as NEW but artificially assign nextReviewAt
    await prisma.learningCard.update({
      where: { id: allCards[1].id },
      data: {
        state: 'NEW',
        nextReviewAt: new Date(),
      },
    });

    const newCards = await newCardsRepo.findNewCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
    });

    const returnedIds = newCards.map((c) => c.id);
    expect(returnedIds).not.toContain(allCards[0].id);
    expect(returnedIds).not.toContain(allCards[1].id);
  });

  it('(3) returns empty array when driver is not enrolled in the variant', async () => {
    const newCards = await newCardsRepo.findNewCards({
      driverId: 'unregistered-driver',
      variantKey: targetVariantKey,
    });

    expect(newCards).toEqual([]);
  });

  it('(4) respects limit parameter when provided and maintains deterministic id ASC ordering', async () => {
    const allNewCards = await newCardsRepo.findNewCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
    });

    expect(allNewCards.length).toBeGreaterThan(2);

    const limitedCards = await newCardsRepo.findNewCards({
      driverId: DEFAULT_DRIVER_ID,
      variantKey: targetVariantKey,
      limit: 2,
    });

    expect(limitedCards).toHaveLength(2);
    expect(limitedCards[0].id).toBe(allNewCards[0].id);
    expect(limitedCards[1].id).toBe(allNewCards[1].id);
  });
});
