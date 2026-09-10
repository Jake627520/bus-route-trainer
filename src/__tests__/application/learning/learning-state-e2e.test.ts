import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ImportGtfsUseCase } from '@/application/gtfs/import-gtfs-use-case';
import { PrismaGtfsRepository } from '@/infrastructure/gtfs/importer/prisma-gtfs-repository';
import { GET as getVariantsHandler } from '@/app/api/routes/[routeId]/variants/route';
import { POST as enrollHandler } from '@/app/api/progress/enroll/route';
import { GET as getProgressHandler } from '@/app/api/progress/[variantKey]/route';
import { EnrollVariantUseCase } from '@/application/learning/enroll-variant-use-case';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';

describe('Change 04 Driver Learning State End-to-End Vertical Slice Integration', () => {
  const prisma = new PrismaClient();
  const writeRepo = new PrismaGtfsRepository(prisma);
  const importer = new ImportGtfsUseCase(writeRepo);

  const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures/gtfs');
  const validFeedDir = path.join(fixturesDir, 'valid-feed');

  let enrolledVariantKey: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Clean all tables in reverse foreign key order
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendarDate.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();

    // 2. Ingest existing Change 02 synthetic valid-feed
    const report = await importer.execute(validFeedDir);
    expect(report.routesCount).toBe(1);
    expect(report.tripsCount).toBe(2);
    expect(report.stopsCount).toBe(3);
  });

  afterAll(async () => {
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendarDate.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();
    await prisma.$disconnect();
  });

  it('queries variants via Change 03, enrolls driver, and retrieves progress with dynamically projected cards', async () => {
    // 1. Query route variants for R66 via Change 03 Route Handler
    const variantReq = new Request('http://localhost/api/routes/R66/variants');
    const variantRes = await getVariantsHandler(variantReq, {
      params: Promise.resolve({ routeId: 'R66' }),
    });
    expect(variantRes.status).toBe(200);
    const variantBody = await variantRes.json();
    expect(variantBody.data).toHaveLength(2);

    const variant = variantBody.data.find((v: { directionId: number }) => v.directionId === 0)!;
    expect(variant).toBeDefined();
    enrolledVariantKey = variant.variantKey;
    expect(enrolledVariantKey).toBe('R66_DIR0_ST_01>ST_02>ST_03');
    expect(variant.orderedStops).toHaveLength(3); // ST_01, ST_02, ST_03

    // 2. Enroll default driver via Change 04 POST /api/progress/enroll
    const enrollReq = new Request('http://localhost/api/progress/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId: 'R66',
        variantKey: enrolledVariantKey,
      }),
    });
    const enrollRes = await enrollHandler(enrollReq);
    expect(enrollRes.status).toBe(201); // Newly enrolled
    const enrollBody = await enrollRes.json();
    expect(enrollBody.data.totalCards).toBe(5); // 3 STOP + 2 NEXT_STOP

    // 3. Query progress via Change 04 GET /api/progress/[variantKey] with URL encoding
    const encodedKey = encodeURIComponent(enrolledVariantKey);
    const getReq = new Request(`http://localhost/api/progress/${encodedKey}`);
    const getRes = await getProgressHandler(getReq, {
      params: Promise.resolve({ variantKey: enrolledVariantKey }),
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();

    expect(getBody.data.targetVariantKey).toBe(enrolledVariantKey);
    expect(getBody.data.cards).toHaveLength(5);

    // Verify dynamic sequence projection
    const stop1 = getBody.data.cards.find((c: { cardKey: string }) => c.cardKey === 'STOP::ST_01');
    const stop2 = getBody.data.cards.find((c: { cardKey: string }) => c.cardKey === 'STOP::ST_02');
    const next1to2 = getBody.data.cards.find(
      (c: { cardKey: string }) => c.cardKey === 'NEXT_STOP::ST_01->ST_02'
    );
    const next2to3 = getBody.data.cards.find(
      (c: { cardKey: string }) => c.cardKey === 'NEXT_STOP::ST_02->ST_03'
    );

    // Dynamic sequence projection strictly preserves GTFS sequence numbers
    expect(stop1.currentSequence).toBe(1);
    expect(stop2.currentSequence).toBe(23);
    expect(next1to2.currentSequence).toBe(1); // departure station sequence
    expect(next2to3.currentSequence).toBe(23); // departure station sequence
  });

  it('verifies concurrent enrollment idempotency and cross-driver data isolation', async () => {
    const learningRepo = new PrismaLearningProgressRepository(prisma);
    const gtfsReadRepo = new PrismaGtfsReadRepository(prisma);
    const getRouteVariants = new GetRouteVariantsUseCase(gtfsReadRepo);
    const useCase = new EnrollVariantUseCase(learningRepo, getRouteVariants);

    // Concurrent enrollment for driver_alice
    const [alice1, alice2] = await Promise.all([
      useCase.execute({ driverId: 'driver_alice', routeId: 'R66', variantKey: enrolledVariantKey }),
      useCase.execute({ driverId: 'driver_alice', routeId: 'R66', variantKey: enrolledVariantKey }),
    ]);
    expect(alice1.progress.id).toBe(alice2.progress.id);

    // Independent enrollment for driver_bob
    const bob = await useCase.execute({
      driverId: 'driver_bob',
      routeId: 'R66',
      variantKey: enrolledVariantKey,
    });
    expect(bob.progress.id).not.toBe(alice1.progress.id);
    expect(bob.progress.driverId).toBe('driver_bob');

    const aliceDb = await learningRepo.findByDriverAndVariant('driver_alice', enrolledVariantKey);
    const bobDb = await learningRepo.findByDriverAndVariant('driver_bob', enrolledVariantKey);
    expect(aliceDb!.id).toBe(alice1.progress.id);
    expect(bobDb!.id).toBe(bob.progress.id);
  });
});
