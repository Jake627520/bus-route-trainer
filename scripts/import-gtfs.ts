import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ImportGtfsUseCase } from '../src/application/gtfs/import-gtfs-use-case';
import { PrismaGtfsRepository } from '../src/infrastructure/gtfs/importer/prisma-gtfs-repository';

async function main(): Promise<void> {
  const feedDirArg = process.argv[2];
  if (!feedDirArg) {
    console.error('Error: Please provide the GTFS feed directory path as an argument.');
    console.error('Usage: npx tsx scripts/import-gtfs.ts <path-to-gtfs-feed-dir>');
    process.exit(1);
  }

  const feedDirPath = path.resolve(process.cwd(), feedDirArg);
  console.log(`[GTFS Importer] Initialising import from: ${feedDirPath}`);

  const prisma = new PrismaClient();
  const repository = new PrismaGtfsRepository(prisma);
  const useCase = new ImportGtfsUseCase(repository);

  try {
    const report = await useCase.execute(feedDirPath);
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
