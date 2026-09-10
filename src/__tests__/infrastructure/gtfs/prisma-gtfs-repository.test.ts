import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaGtfsRepository } from '@/infrastructure/gtfs/importer/prisma-gtfs-repository';
import { ImportConflictError } from '@/application/gtfs/cross-file-validator';

describe('PrismaGtfsRepository Persistence & Transaction Atomicity', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaGtfsRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean tables in reverse topological order
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendarDate.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();
  });

  it('inserts new records and performs clean identical payload idempotency (no-op on repeat)', async () => {
    const route = {
      id: 'R_TEST_01',
      shortName: '66',
      longName: 'RBWH - UQ Lakes',
      routeType: 3,
    };

    // 1. First save: insert
    const count1 = await repository.executeInTransaction(async (tx) => {
      return await tx.saveRoutes([route]);
    });
    expect(count1).toBe(1);

    // 2. Second save: identical payload -> 0 mutation (no-op)
    const count2 = await repository.executeInTransaction(async (tx) => {
      return await tx.saveRoutes([route]);
    });
    expect(count2).toBe(0);

    const inDb = await prisma.gtfsRoute.findUnique({ where: { id: 'R_TEST_01' } });
    expect(inDb?.shortName).toBe('66');
    expect(inDb?.longName).toBe('RBWH - UQ Lakes');
  });

  it('detects database conflict and throws ImportConflictError when payload differs', async () => {
    const originalRoute = {
      id: 'R_TEST_01',
      shortName: '66',
      longName: 'RBWH - UQ Lakes',
      routeType: 3,
    };

    await repository.executeInTransaction(async (tx) => {
      return await tx.saveRoutes([originalRoute]);
    });

    const conflictingRoute = {
      id: 'R_TEST_01',
      shortName: '66X', // Conflicting short name
      longName: 'RBWH - UQ Lakes Express',
      routeType: 3,
    };

    await expect(
      repository.executeInTransaction(async (tx) => {
        return await tx.saveRoutes([conflictingRoute]);
      })
    ).rejects.toThrow(ImportConflictError);

    // DB record must remain untouched
    const inDb = await prisma.gtfsRoute.findUnique({ where: { id: 'R_TEST_01' } });
    expect(inDb?.shortName).toBe('66');
  });

  it('supports all GTFS entity repositories with identical-no-op and conflict detection', async () => {
    await repository.executeInTransaction(async (tx) => {
      // 1. Agency
      const agencyCount = await tx.saveAgencies([
        { id: 'AG_01', name: 'Translink', timezone: 'Australia/Brisbane' },
      ]);
      expect(agencyCount).toBe(1);

      // 2. Calendar
      const calCount = await tx.saveCalendars([
        {
          serviceId: 'SERV_01',
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
      ]);
      expect(calCount).toBe(1);

      // 3. CalendarDate
      const calDateCount = await tx.saveCalendarDates([
        { serviceId: 'SERV_01', date: '20260425', exceptionType: 2 },
      ]);
      expect(calDateCount).toBe(1);

      // 4. Stop
      const stopCount = await tx.saveStops([
        { id: 'STOP_01', name: 'UQ Lakes Station', latitude: -27.498, longitude: 153.018 },
      ]);
      expect(stopCount).toBe(1);

      // 5. Route
      const routeCount = await tx.saveRoutes([
        { id: 'R_01', shortName: '66', longName: 'RBWH - UQ', routeType: 3 },
      ]);
      expect(routeCount).toBe(1);

      // 6. Trip
      const tripCount = await tx.saveTrips([
        {
          id: 'TRIP_01',
          routeId: 'R_01',
          serviceId: 'SERV_01',
          directionId: 0,
          tripHeadsign: 'UQ Lakes',
          shapeId: null,
        },
      ]);
      expect(tripCount).toBe(1);

      // 7. StopTime
      const stCount = await tx.saveStopTimes([
        {
          tripId: 'TRIP_01',
          stopSequence: 1,
          stopId: 'STOP_01',
          arrivalTime: '08:00:00',
          departureTime: '08:00:00',
          isTimepoint: true,
        },
      ]);
      expect(stCount).toBe(1);

      // Re-saving identical stop time must be NO-OP
      const repeatStCount = await tx.saveStopTimes([
        {
          tripId: 'TRIP_01',
          stopSequence: 1,
          stopId: 'STOP_01',
          arrivalTime: '08:00:00',
          departureTime: '08:00:00',
          isTimepoint: true,
        },
      ]);
      expect(repeatStCount).toBe(0);
    });

    // Conflict detection on composite PK stop_times
    await expect(
      repository.executeInTransaction(async (tx) => {
        return await tx.saveStopTimes([
          {
            tripId: 'TRIP_01',
            stopSequence: 1,
            stopId: 'STOP_01',
            arrivalTime: '08:05:00', // Conflict
            departureTime: '08:05:00',
            isTimepoint: true,
          },
        ]);
      })
    ).rejects.toThrow(ImportConflictError);
  });

  it('guarantees 100% rollback on mid-transaction error (zero partial import)', async () => {
    const agency = {
      id: 'AGENCY_ATOM',
      name: 'Atomic Transit',
      timezone: 'Australia/Brisbane',
    };
    const route = {
      id: 'ROUTE_ATOM',
      shortName: '99',
      longName: 'Atomic Route',
      routeType: 3,
    };

    const attemptFailure = repository.executeInTransaction(async (tx) => {
      await tx.saveAgencies([agency]);
      await tx.saveRoutes([route]);
      // Simulate fatal failure downstream at row 500,001
      throw new Error('Simulated mid-import error at row 500,001');
    });

    await expect(attemptFailure).rejects.toThrow('Simulated mid-import error at row 500,001');

    // Database verification: Neither Agency nor Route must exist
    const inDbAgency = await prisma.gtfsAgency.findUnique({ where: { id: 'AGENCY_ATOM' } });
    const inDbRoute = await prisma.gtfsRoute.findUnique({ where: { id: 'ROUTE_ATOM' } });
    expect(inDbAgency).toBeNull();
    expect(inDbRoute).toBeNull();
  });

  it('supports configurable transaction options (timeoutMs, maxWaitMs)', async () => {
    let executed = false;
    await repository.executeInTransaction(
      async (tx) => {
        const agencyCount = await tx.saveAgencies([
          { id: 'AG_TIMEOUT', name: 'Timeout Test', timezone: 'Australia/Brisbane' },
        ]);
        expect(agencyCount).toBe(1);
        executed = true;
      },
      { timeoutMs: 30000, maxWaitMs: 5000 }
    );
    expect(executed).toBe(true);
  });
});
