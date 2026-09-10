import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { EnrollVariantUseCase, VariantNotFoundError } from '@/application/learning/enroll-variant-use-case';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { GtfsReadRepository, RouteTripAggregateDto } from '@/application/gtfs/gtfs-read-repository.port';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

// In-memory mock for GtfsReadRepository
class MockGtfsReadRepository implements GtfsReadRepository {
  public data: Record<string, RouteTripAggregateDto> = {};

  async findAllRoutes() {
    return [];
  }

  async findTripsWithStopTimesByRouteId(routeId: string) {
    return this.data[routeId] ?? null;
  }
}

describe('EnrollVariantUseCase Unit & Concurrency Tests', () => {
  const prisma = new PrismaClient();
  const learningRepo = new PrismaLearningProgressRepository(prisma);
  const mockGtfsRepo = new MockGtfsReadRepository();
  const getVariantsUseCase = new GetRouteVariantsUseCase(mockGtfsRepo);
  const useCase = new EnrollVariantUseCase(learningRepo, getVariantsUseCase);

  const sampleRouteId = 'R66';
  const sampleVariantKey = 'R66_DIR0_stop_1>stop_2>stop_3';

  beforeAll(async () => {
    await prisma.$connect();

    // Set up mock GTFS variant topology: 3 stops: stop_1, stop_2, stop_3
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

  it('enrolls driver in variant, generating N STOP and (N-1) NEXT_STOP cards', async () => {
    const result = await useCase.execute({
      routeId: sampleRouteId,
      variantKey: sampleVariantKey,
    });

    expect(result.isNew).toBe(true);
    expect(result.progress.driverId).toBe(DEFAULT_DRIVER_ID);
    expect(result.progress.routeId).toBe(sampleRouteId);
    expect(result.progress.targetVariantKey).toBe(sampleVariantKey);
    // 3 stops -> 3 STOP cards + 2 NEXT_STOP cards = 5 cards total
    expect(result.progress.totalCards).toBe(5);

    const saved = await learningRepo.findByDriverAndVariant(DEFAULT_DRIVER_ID, sampleVariantKey);
    expect(saved).not.toBeNull();
    expect(saved!.cards).toHaveLength(5);
  });

  it('sequential repeat enrollment is idempotent and does not create duplicate cards', async () => {
    const first = await useCase.execute({
      routeId: sampleRouteId,
      variantKey: sampleVariantKey,
    });
    expect(first.isNew).toBe(true);

    const second = await useCase.execute({
      routeId: sampleRouteId,
      variantKey: sampleVariantKey,
    });
    expect(second.isNew).toBe(false);
    expect(second.progress.id).toBe(first.progress.id);

    const totalProgress = await prisma.driverVariantProgress.count();
    const totalCards = await prisma.learningCard.count();
    expect(totalProgress).toBe(1);
    expect(totalCards).toBe(5);
  });

  it('Test B (concurrent enrollment): parallel enrollment requests resolve idempotently without throwing P2002 error', async () => {
    const driverId = 'driver_concurrent_test';

    // Fire 2 concurrent enrollments simultaneously
    const [resA, resB] = await Promise.all([
      useCase.execute({ driverId, routeId: sampleRouteId, variantKey: sampleVariantKey }),
      useCase.execute({ driverId, routeId: sampleRouteId, variantKey: sampleVariantKey }),
    ]);

    expect(resA.progress.id).toBe(resB.progress.id);
    expect([resA.isNew, resB.isNew]).toContain(true);

    // Exactly 1 DriverVariantProgress and exactly 5 cards persisted in database
    const progressCount = await prisma.driverVariantProgress.count({
      where: { driverId, targetVariantKey: sampleVariantKey },
    });
    expect(progressCount).toBe(1);

    const cardsCount = await prisma.learningCard.count({
      where: { progress: { driverId, targetVariantKey: sampleVariantKey } },
    });
    expect(cardsCount).toBe(5);
  });

  it('throws VariantNotFoundError (404) when target variant does not exist', async () => {
    await expect(
      useCase.execute({
        routeId: sampleRouteId,
        variantKey: 'R66_DIR0_nonexistent>route',
      })
    ).rejects.toThrow(VariantNotFoundError);
  });
});
