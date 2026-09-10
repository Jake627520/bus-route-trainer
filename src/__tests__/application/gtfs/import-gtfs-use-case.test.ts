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
});
