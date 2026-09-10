import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ImportGtfsUseCase } from '@/application/gtfs/import-gtfs-use-case';
import { PrismaGtfsRepository } from '@/infrastructure/gtfs/importer/prisma-gtfs-repository';
import { GET as getRoutesHandler } from '@/app/api/routes/route';
import { GET as getVariantsHandler } from '@/app/api/routes/[routeId]/variants/route';

describe('Change 03 GTFS Read Side End-to-End Vertical Slice Integration', () => {
  const prisma = new PrismaClient();
  const writeRepo = new PrismaGtfsRepository(prisma);
  const importer = new ImportGtfsUseCase(writeRepo);

  const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures/gtfs');
  const validFeedDir = path.join(fixturesDir, 'valid-feed');

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Clean tables
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
    expect(report.stopTimesCount).toBe(6);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('queries GET /api/routes and returns persisted routes with standard envelope', async () => {
    const response = await getRoutesHandler();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveLength(1);

    const route = body.data[0];
    expect(route.id).toBe('R66');
    expect(route.shortName).toBe('66');
    expect(route.longName).toContain('RBWH - UQ Lakes');
  });

  it('queries GET /api/routes/R66/variants and returns reconstructed variants with deterministic orderedStops', async () => {
    const request = new Request('http://localhost:3000/api/routes/R66/variants');
    const response = await getVariantsHandler(request, {
      params: Promise.resolve({ routeId: 'R66' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('data');
    // Valid-feed has 2 trips: T66_01 (dir 0: ST_01 -> ST_02 -> ST_03) and T66_02 (dir 1: ST_03 -> ST_02 -> ST_01)
    expect(body.data).toHaveLength(2);

    // Direction 0 variant
    const dir0Variant = body.data.find((v: { directionId: number }) => v.directionId === 0);
    expect(dir0Variant).toBeDefined();
    expect(dir0Variant.routeId).toBe('R66');
    expect(dir0Variant.headsign).toBe('UQ Lakes');
    expect(dir0Variant.sampleTripId).toBe('T66_01');
    expect(dir0Variant.orderedStops).toHaveLength(3);
    expect(dir0Variant.orderedStops[0].stopId).toBe('ST_01');
    expect(dir0Variant.orderedStops[0].stopSequence).toBe(1);
    expect(dir0Variant.orderedStops[1].stopId).toBe('ST_02');
    expect(dir0Variant.orderedStops[1].stopSequence).toBe(23);
    expect(dir0Variant.orderedStops[2].stopId).toBe('ST_03');
    expect(dir0Variant.orderedStops[2].stopSequence).toBe(40);

    // Direction 1 variant
    const dir1Variant = body.data.find((v: { directionId: number }) => v.directionId === 1);
    expect(dir1Variant).toBeDefined();
    expect(dir1Variant.routeId).toBe('R66');
    expect(dir1Variant.headsign).toBe('RBWH');
    expect(dir1Variant.sampleTripId).toBe('T66_02');
    expect(dir1Variant.orderedStops).toHaveLength(3);
    expect(dir1Variant.orderedStops[0].stopId).toBe('ST_03');
    expect(dir1Variant.orderedStops[0].stopSequence).toBe(1);
    expect(dir1Variant.orderedStops[1].stopId).toBe('ST_02');
    expect(dir1Variant.orderedStops[1].stopSequence).toBe(5);
    expect(dir1Variant.orderedStops[2].stopId).toBe('ST_01');
    expect(dir1Variant.orderedStops[2].stopSequence).toBe(9);
  });

  it('queries GET /api/routes/UNKNOWN/variants and returns 404 error envelope', async () => {
    const request = new Request('http://localhost:3000/api/routes/UNKNOWN/variants');
    const response = await getVariantsHandler(request, {
      params: Promise.resolve({ routeId: 'UNKNOWN' }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: "Route with id 'UNKNOWN' was not found",
      },
    });
  });
});
