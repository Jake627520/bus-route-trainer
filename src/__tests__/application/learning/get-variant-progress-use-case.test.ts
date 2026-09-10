import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import {
  GetVariantProgressUseCase,
  ProgressNotFoundError,
} from '@/application/learning/get-variant-progress-use-case';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { GtfsReadRepository, RouteTripAggregateDto } from '@/application/gtfs/gtfs-read-repository.port';
import { DriverVariantProgress, ProgressStatus } from '@/domain/learning/driver-variant-progress';
import { LearningCard, CardType } from '@/domain/learning/learning-card';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

class MockGtfsReadRepository implements GtfsReadRepository {
  public data: Record<string, RouteTripAggregateDto> = {};

  async findAllRoutes() {
    return [];
  }

  async findTripsWithStopTimesByRouteId(routeId: string) {
    return this.data[routeId] ?? null;
  }
}

describe('GetVariantProgressUseCase Unit Tests', () => {
  const prisma = new PrismaClient();
  const learningRepo = new PrismaLearningProgressRepository(prisma);
  const mockGtfsRepo = new MockGtfsReadRepository();
  const getVariantsUseCase = new GetRouteVariantsUseCase(mockGtfsRepo);
  const useCase = new GetVariantProgressUseCase(learningRepo, getVariantsUseCase);

  const sampleRouteId = 'R66';
  const sampleVariantKey = 'R66_DIR0_stop_1>stop_2>stop_3';

  beforeAll(async () => {
    await prisma.$connect();

    mockGtfsRepo.data[sampleRouteId] = {
      route: {
        id: sampleRouteId,
        shortName: '66',
        longName: 'RBWH - UQ Lakes',
        routeType: 3,
      },
      trips: [
        {
          tripId: 'T66_1',
          serviceId: 'SERV_1',
          directionId: 0,
          tripHeadsign: 'UQ Lakes',
          shapeId: null,
          stopTimes: [
            {
              stopSequence: 1,
              stopId: 'stop_1',
              stopName: 'Stop 1',
              arrivalTime: '08:00:00',
              departureTime: '08:00:00',
              isTimepoint: true,
            },
            {
              stopSequence: 2,
              stopId: 'stop_2',
              stopName: 'Stop 2',
              arrivalTime: '08:10:00',
              departureTime: '08:10:00',
              isTimepoint: false,
            },
            {
              stopSequence: 3,
              stopId: 'stop_3',
              stopName: 'Stop 3',
              arrivalTime: '08:20:00',
              departureTime: '08:20:00',
              isTimepoint: true,
            },
          ],
        },
      ],
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
  });

  it('retrieves progress and cards with dynamically projected currentSequence (stopId for STOP, fromStopId for NEXT_STOP)', async () => {
    const progressId = 'prog_get_1';
    const card1 = new LearningCard({
      id: 'c1',
      progressId,
      cardKey: 'STOP::stop_1',
      cardType: CardType.STOP,
    });
    const card2 = new LearningCard({
      id: 'c2',
      progressId,
      cardKey: 'STOP::stop_2',
      cardType: CardType.STOP,
    });
    const cardNext = new LearningCard({
      id: 'c3',
      progressId,
      cardKey: 'NEXT_STOP::stop_1->stop_2',
      cardType: CardType.NEXT_STOP,
    });

    const progress = new DriverVariantProgress({
      id: progressId,
      driverId: DEFAULT_DRIVER_ID,
      routeId: sampleRouteId,
      directionId: 0,
      targetVariantKey: sampleVariantKey,
      status: ProgressStatus.NOT_STARTED,
      cards: [card1, card2, cardNext],
    });

    await learningRepo.saveProgressWithCards(progress);

    const result = await useCase.execute({ variantKey: sampleVariantKey });

    expect(result.id).toBe(progressId);
    expect(result.cards).toHaveLength(3);

    const stop1 = result.cards.find((c) => c.cardKey === 'STOP::stop_1')!;
    const stop2 = result.cards.find((c) => c.cardKey === 'STOP::stop_2')!;
    const next1to2 = result.cards.find((c) => c.cardKey === 'NEXT_STOP::stop_1->stop_2')!;

    // STOP cards get sequence of stopId
    expect(stop1.currentSequence).toBe(1);
    expect(stop2.currentSequence).toBe(2);

    // NEXT_STOP card gets sequence of fromStopId (departure station sequence = 1)
    expect(next1to2.currentSequence).toBe(1);
  });

  it('throws ProgressNotFoundError (404) when driver has not enrolled', async () => {
    await expect(
      useCase.execute({ variantKey: 'R66_DIR0_unenrolled' })
    ).rejects.toThrow(ProgressNotFoundError);
  });

  it('topology resilience: when GTFS topology is missing or unresolvable, returns cards with currentSequence: null and NEVER deletes records', async () => {
    const progressId = 'prog_resilience';
    const legacyVariantKey = 'R999_DIR0_old_route_stops';

    const card = new LearningCard({
      id: 'c_leg',
      progressId,
      cardKey: 'STOP::old_stop',
      cardType: CardType.STOP,
    });

    const progress = new DriverVariantProgress({
      id: progressId,
      driverId: DEFAULT_DRIVER_ID,
      routeId: 'R999',
      directionId: 0,
      targetVariantKey: legacyVariantKey,
      cards: [card],
    });

    await learningRepo.saveProgressWithCards(progress);

    // GTFS repository returns null for R999
    const result = await useCase.execute({ variantKey: legacyVariantKey });

    expect(result.id).toBe(progressId);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].currentSequence).toBeNull();

    // Verify progress and cards are still 100% persisted in DB
    const inDb = await prisma.driverVariantProgress.findUnique({ where: { id: progressId } });
    expect(inDb).not.toBeNull();
    const cardsInDb = await prisma.learningCard.findMany({ where: { progressId } });
    expect(cardsInDb).toHaveLength(1);
  });
});
