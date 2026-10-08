import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ImportGtfsUseCase } from '@/application/gtfs/import-gtfs-use-case';
import { PrismaGtfsRepository } from '@/infrastructure/gtfs/importer/prisma-gtfs-repository';
import { UnsupportedMultiAgencyFeedError } from '@/infrastructure/gtfs/parser/gtfs-row-schemas';
import { ReferentialIntegrityError } from '@/application/gtfs/cross-file-validator';

describe('ImportGtfsUseCase (Pass 1 Streaming Validation + Pass 2 Atomic Persistence)', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaGtfsRepository(prisma);
  const useCase = new ImportGtfsUseCase(repository);

  const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures/gtfs');
  const validFeedDir = path.join(fixturesDir, 'valid-feed');
  const multiAgencyFeedDir = path.join(fixturesDir, 'multi-agency-feed');
  const invalidAgencyFeedDir = path.join(fixturesDir, 'invalid-agency-feed');
  const caseBFeedDir = path.join(fixturesDir, 'case-b-feed');
  const mixedModesFeedDir = path.join(fixturesDir, 'mixed-modes-feed');

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendarDate.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();
  });

  it('aborts during Pass 1 on multi-agency feed with ZERO database mutation or transaction call', async () => {
    const txSpy = vi.spyOn(repository, 'executeInTransaction');

    await expect(useCase.execute(multiAgencyFeedDir)).rejects.toThrow(
      UnsupportedMultiAgencyFeedError
    );

    // ZERO database transaction initiated
    expect(txSpy).not.toHaveBeenCalled();
    const agencyCount = await prisma.gtfsAgency.count();
    expect(agencyCount).toBe(0);

    txSpy.mockRestore();
  });

  it('aborts during Pass 1 on invalid agency reference with ZERO database mutation', async () => {
    const txSpy = vi.spyOn(repository, 'executeInTransaction');

    await expect(useCase.execute(invalidAgencyFeedDir)).rejects.toThrow(
      ReferentialIntegrityError
    );

    expect(txSpy).not.toHaveBeenCalled();
    const routeCount = await prisma.gtfsRoute.count();
    expect(routeCount).toBe(0);

    txSpy.mockRestore();
  });

  it('successfully imports valid feed in topological order and persists all records atomically', async () => {
    const report = await useCase.execute(validFeedDir);

    expect(report.agencyCount).toBe(1);
    expect(report.routesCount).toBe(1);
    expect(report.stopsCount).toBe(3);
    expect(report.calendarsCount).toBe(1);
    expect(report.calendarDatesCount).toBe(1);
    expect(report.tripsCount).toBe(2);
    expect(report.stopTimesCount).toBe(6);

    // Verify in database
    const agency = await prisma.gtfsAgency.findUnique({ where: { id: 'TRANS_QLD' } });
    expect(agency?.name).toBe('Translink Queensland');

    const routes = await prisma.gtfsRoute.findMany();
    expect(routes).toHaveLength(1);
    expect(routes[0].shortName).toBe('66');

    const stops = await prisma.gtfsStop.findMany();
    expect(stops).toHaveLength(3);

    const trips = await prisma.gtfsTrip.findMany();
    expect(trips).toHaveLength(2);

    const stopTimes = await prisma.gtfsStopTime.findMany();
    expect(stopTimes).toHaveLength(6);
  });

  it('guarantees idempotency on second import run (count inflation = 0)', async () => {
    // 1. Initial import
    const report1 = await useCase.execute(validFeedDir);
    expect(report1.routesCount).toBe(1);
    expect(report1.stopTimesCount).toBe(6);

    // 2. Second import with identical feed
    const report2 = await useCase.execute(validFeedDir);
    expect(report2.agencyCount).toBe(0);
    expect(report2.routesCount).toBe(0);
    expect(report2.stopsCount).toBe(0);
    expect(report2.calendarsCount).toBe(0);
    expect(report2.calendarDatesCount).toBe(0);
    expect(report2.tripsCount).toBe(0);
    expect(report2.stopTimesCount).toBe(0);

    // Verify DB count remains unchanged
    const stopTimesCount = await prisma.gtfsStopTime.count();
    expect(stopTimesCount).toBe(6);
  });

  it('successfully imports Case B feed where calendar.txt is absent and calendar_dates.txt is present', async () => {
    const report = await useCase.execute(caseBFeedDir);
    expect(report.agencyCount).toBe(1);
    expect(report.calendarsCount).toBe(0);
    expect(report.calendarDatesCount).toBe(2);
    expect(report.tripsCount).toBe(1);
  });

  // Change 28: bus-first 過濾（route_type=3），排除 ferry(4)/train(2)。
  describe('route-type filter (Change 28)', () => {
    it('imports only bus routes and their trips/stop-times when routeTypes=[3]', async () => {
      const report = await useCase.execute(mixedModesFeedDir, undefined, { routeTypes: [3] });

      // 只留 bus route + 其 trip + 其 stop_times；stops/calendars 全留（參照安全）
      expect(report.routesCount).toBe(1);
      expect(report.tripsCount).toBe(1);
      expect(report.stopTimesCount).toBe(2);

      const routes = await prisma.gtfsRoute.findMany();
      expect(routes.map((r) => r.id)).toEqual(['BUS1']);
      expect(routes[0].routeType).toBe(3);

      const trips = await prisma.gtfsTrip.findMany();
      expect(trips.map((t) => t.id)).toEqual(['TBUS']);

      const stopTimes = await prisma.gtfsStopTime.findMany();
      expect(stopTimes.every((st) => st.tripId === 'TBUS')).toBe(true);
    });

    it('imports every route when no filter is given (backward compatible)', async () => {
      const report = await useCase.execute(mixedModesFeedDir);
      expect(report.routesCount).toBe(3);
      expect(report.tripsCount).toBe(3);
      expect(report.stopTimesCount).toBe(6);
    });

    // Change 39: ferry（route_type=4）與 maxRoutes 子集。
    it('imports only ferry routes when routeTypes=[4]', async () => {
      const report = await useCase.execute(mixedModesFeedDir, undefined, { routeTypes: [4] });
      expect(report.routesCount).toBe(1);
      const routes = await prisma.gtfsRoute.findMany();
      expect(routes.map((r) => r.id)).toEqual(['FERRY1']);
      expect(routes[0].routeType).toBe(4);
    });

    it('caps routes with maxRoutes (train subset use-case)', async () => {
      // fixture routes.txt 順序：BUS1, FERRY1, TRAIN1 → maxRoutes=2 取前兩條
      const report = await useCase.execute(mixedModesFeedDir, undefined, { maxRoutes: 2 });
      expect(report.routesCount).toBe(2);
      const routes = await prisma.gtfsRoute.findMany({ orderBy: { id: 'asc' } });
      expect(routes.map((r) => r.id)).toEqual(['BUS1', 'FERRY1']);
      // 只保留這兩條的 trips/stop_times（TRAIN1 的不進）
      const trips = await prisma.gtfsTrip.findMany();
      expect(trips.map((t) => t.id).sort()).toEqual(['TBUS', 'TFERRY']);
    });

    it('combines routeTypes and maxRoutes', async () => {
      // route_type=2(train) 只有 TRAIN1，maxRoutes=5 不影響
      const report = await useCase.execute(mixedModesFeedDir, undefined, { routeTypes: [2], maxRoutes: 5 });
      expect(report.routesCount).toBe(1);
      const routes = await prisma.gtfsRoute.findMany();
      expect(routes.map((r) => r.id)).toEqual(['TRAIN1']);
    });
  });
});
