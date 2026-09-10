import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';

describe('PrismaGtfsReadRepository Anti-N+1 Bounded Query & Deterministic Sorting', () => {
  let queryCount = 0;
  const prisma = new PrismaClient({
    log: [{ emit: 'event', level: 'query' }],
  });

  (prisma as unknown as { $on: (event: string, cb: () => void) => void }).$on('query', () => {
    queryCount++;
  });

  const repository = new PrismaGtfsReadRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Reset query count
    queryCount = 0;

    // Clean tables
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendarDate.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();
  });

  it('retrieves all routes in deterministic order (shortName ASC, id ASC)', async () => {
    await prisma.gtfsRoute.createMany({
      data: [
        { id: 'R_B', shortName: '66', longName: 'Route 66 B', routeType: 3 },
        { id: 'R_A', shortName: '66', longName: 'Route 66 A', routeType: 3 },
        { id: 'R_C', shortName: '100', longName: 'Route 100', routeType: 3 },
        { id: 'R_D', shortName: '29', longName: 'Route 29', routeType: 3 },
      ],
    });

    const routes = await repository.findAllRoutes();
    expect(routes).toHaveLength(4);

    // Standard string character code ordering: '100' < '29' < '66'
    expect(routes[0].shortName).toBe('100');
    expect(routes[1].shortName).toBe('29');
    expect(routes[2].shortName).toBe('66');
    expect(routes[2].id).toBe('R_A'); // R_A < R_B
    expect(routes[3].shortName).toBe('66');
    expect(routes[3].id).toBe('R_B');
  });

  it('returns null when querying a non-existent routeId', async () => {
    const result = await repository.findTripsWithStopTimesByRouteId('NON_EXISTENT');
    expect(result).toBeNull();
  });

  it('executes a bounded number of database queries independent of trip or stop counts (anti-N+1)', async () => {
    // 1. Setup agency & calendar
    await prisma.gtfsAgency.create({
      data: { id: 'AG_1', name: 'Translink', timezone: 'Australia/Brisbane' },
    });
    await prisma.gtfsCalendar.create({
      data: {
        serviceId: 'SERV_1',
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
        startDate: '20260101',
        endDate: '20261231',
      },
    });

    // 2. Setup route
    await prisma.gtfsRoute.create({
      data: { id: 'R66', shortName: '66', longName: 'RBWH - UQ Lakes', routeType: 3 },
    });

    // 3. Setup stops
    const stopsData = Array.from({ length: 15 }, (_, i) => ({
      id: `ST_${i + 1}`,
      name: `Stop Station ${i + 1}`,
      latitude: -27.4 + i * 0.01,
      longitude: 153.0 + i * 0.01,
    }));
    await prisma.gtfsStop.createMany({ data: stopsData });

    // 4. Setup 5 trips with 15 stops each (total 75 stop times)
    for (let t = 1; t <= 5; t++) {
      const tripId = `TRIP_${t}`;
      await prisma.gtfsTrip.create({
        data: {
          id: tripId,
          routeId: 'R66',
          serviceId: 'SERV_1',
          directionId: t % 2,
          tripHeadsign: `Destination ${t}`,
        },
      });

      const stopTimesData = stopsData.map((s, idx) => ({
        tripId,
        stopSequence: (idx + 1) * 2, // non-consecutive: 2, 4, 6...
        stopId: s.id,
        arrivalTime: `08:${String(idx).padStart(2, '0')}:00`,
        departureTime: `08:${String(idx).padStart(2, '0')}:30`,
        isTimepoint: idx === 0 || idx === stopsData.length - 1,
      }));
      await prisma.gtfsStopTime.createMany({ data: stopTimesData });
    }

    // Reset query count right before read repository call
    queryCount = 0;

    const aggregate = await repository.findTripsWithStopTimesByRouteId('R66');

    expect(aggregate).not.toBeNull();
    expect(aggregate?.route.id).toBe('R66');
    expect(aggregate?.trips).toHaveLength(5);
    expect(aggregate?.trips[0].stopTimes).toHaveLength(15);

    // Bounded query verification:
    // With 5 trips and 15 stops each, an N+1 loop would issue 1 + 5 + 75 = 81 queries.
    // A bounded query strategy uses a constant, fixed number of queries (<= 5).
    expect(queryCount).toBeGreaterThan(0);
    expect(queryCount).toBeLessThanOrEqual(5);

    // Verify ordering:
    // Trips ordered by directionId ASC, then id ASC
    const trips = aggregate!.trips;
    expect(trips[0].directionId).toBeLessThanOrEqual(trips[1].directionId);

    // Stop times ordered by stopSequence ASC
    const stList = trips[0].stopTimes;
    for (let i = 0; i < stList.length - 1; i++) {
      expect(stList[i].stopSequence).toBeLessThan(stList[i + 1].stopSequence);
    }
  });
});
