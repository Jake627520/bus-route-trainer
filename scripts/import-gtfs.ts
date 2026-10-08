import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ImportGtfsUseCase } from '../src/application/gtfs/import-gtfs-use-case';
import { PrismaGtfsRepository } from '../src/infrastructure/gtfs/importer/prisma-gtfs-repository';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const positional = args.filter((a) => !a.startsWith('--'));
  const feedDirArg = positional[0];
  if (!feedDirArg) {
    console.error('Error: Please provide the GTFS feed directory path as an argument.');
    console.error('Usage: npx tsx scripts/import-gtfs.ts <feed-dir> [--bus-only] [--route-types=3,4] [--max-routes=N] [--clear] [--tx-timeout-ms=N]');
    process.exit(1);
  }

  // 過濾：--bus-only 等同 --route-types=3；--route-types=a,b 自訂。
  let routeTypes: number[] | undefined;
  const routeTypesFlag = flags.find((f) => f.startsWith('--route-types='));
  if (routeTypesFlag) {
    routeTypes = routeTypesFlag
      .slice('--route-types='.length)
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));
  } else if (flags.includes('--bus-only')) {
    routeTypes = [3];
  }

  // 大型 feed 的持久化在單一交易內完成，需要較長逾時（Prisma 預設 60s 不夠）。
  const txTimeoutFlag = flags.find((f) => f.startsWith('--tx-timeout-ms='));
  const timeoutMs = txTimeoutFlag
    ? Number(txTimeoutFlag.slice('--tx-timeout-ms='.length))
    : 1_800_000; // 30 分鐘

  // 最多保留幾條路線（train 子集用，避免爆容量）。
  const maxRoutesFlag = flags.find((f) => f.startsWith('--max-routes='));
  const maxRoutes = maxRoutesFlag ? Number(maxRoutesFlag.slice('--max-routes='.length)) : undefined;

  const feedDirPath = path.resolve(process.cwd(), feedDirArg);
  console.log(`[GTFS Importer] Initialising import from: ${feedDirPath}`);
  if (routeTypes) {
    console.log(`[GTFS Importer] route_type filter: [${routeTypes.join(', ')}]`);
  }
  if (maxRoutes) {
    console.log(`[GTFS Importer] max routes: ${maxRoutes}`);
  }
  console.log(`[GTFS Importer] transaction timeout: ${timeoutMs} ms`);

  const prisma = new PrismaClient();
  const repository = new PrismaGtfsRepository(prisma);
  const useCase = new ImportGtfsUseCase(repository);

  // --clear：匯入前清空 gtfs 資料表（用於整份 feed 重新整理；driver 進度為 soft ref，不受影響）。
  if (flags.includes('--clear')) {
    console.log('[GTFS Importer] clearing existing GTFS tables…');
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendarDate.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();
  }

  const filter =
    routeTypes || maxRoutes
      ? { ...(routeTypes ? { routeTypes } : {}), ...(maxRoutes ? { maxRoutes } : {}) }
      : undefined;

  try {
    const report = await useCase.execute(
      feedDirPath,
      { timeoutMs, maxWaitMs: 30_000 },
      filter
    );
    console.log('\n[GTFS Importer] Import completed successfully.');
    console.log('--------------------------------------------------');
    console.log(`Agencies persisted:       ${report.agencyCount}`);
    console.log(`Routes persisted:         ${report.routesCount}`);
    console.log(`Stops persisted:          ${report.stopsCount}`);
    console.log(`Calendars persisted:      ${report.calendarsCount}`);
    console.log(`Calendar dates persisted: ${report.calendarDatesCount}`);
    console.log(`Trips persisted:          ${report.tripsCount}`);
    console.log(`Stop times persisted:     ${report.stopTimesCount}`);
    console.log('--------------------------------------------------');
  } catch (err) {
    console.error('\n[GTFS Importer] Import failed. Any partial modifications have been rolled back.');
    if (err instanceof Error) {
      console.error(`Reason: [${err.name}] ${err.message}`);
    } else {
      console.error('Reason:', err);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
