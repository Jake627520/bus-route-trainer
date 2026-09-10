import fs from 'node:fs';
import path from 'node:path';
import { GtfsRepository, TransactionOptions } from './gtfs-repository.port';
import { CrossFileValidator } from './cross-file-validator';
import { parseCsvStream } from '@/infrastructure/gtfs/parser/csv-stream-parser';
import {
  calendarDateRowSchema,
  calendarRowSchema,
  routeRowSchema,
  stopRowSchema,
  stopTimeRowSchema,
  tripRowSchema,
  validateAgencyRows,
  validateStopSequenceMonotonicity,
  validateTripTimingRules,
} from '@/infrastructure/gtfs/parser/gtfs-row-schemas';

export interface ImportGtfsReport {
  agencyCount: number;
  routesCount: number;
  stopsCount: number;
  calendarsCount: number;
  calendarDatesCount: number;
  tripsCount: number;
  stopTimesCount: number;
}

export class ImportGtfsUseCase {
  constructor(private readonly repository: GtfsRepository) {}

  public async execute(
    feedDirPath: string,
    options?: TransactionOptions
  ): Promise<ImportGtfsReport> {
    const agencyFile = path.join(feedDirPath, 'agency.txt');
    const routesFile = path.join(feedDirPath, 'routes.txt');
    const stopsFile = path.join(feedDirPath, 'stops.txt');
    const calendarFile = path.join(feedDirPath, 'calendar.txt');
    const calendarDatesFile = path.join(feedDirPath, 'calendar_dates.txt');
    const tripsFile = path.join(feedDirPath, 'trips.txt');
    const stopTimesFile = path.join(feedDirPath, 'stop_times.txt');

    if (!fs.existsSync(agencyFile)) throw new Error('agency.txt is required but missing');

    // =========================================================================
    // PASS 1: Streaming Validation (Zero DB interaction)
    // =========================================================================
    const validator = new CrossFileValidator();

    // 1. Agency
    const rawAgencyRows: Record<string, string>[] = [];
    for await (const row of parseCsvStream(fs.createReadStream(agencyFile))) {
      rawAgencyRows.push(row);
    }
    const validAgency = validateAgencyRows(rawAgencyRows);
    validator.registerAgency(validAgency.id);

    // 2. Routes
    if (!fs.existsSync(routesFile)) throw new Error('routes.txt is required but missing');
    for await (const row of parseCsvStream(fs.createReadStream(routesFile))) {
      const parsed = routeRowSchema.parse(row);
      validator.registerRoute(parsed.id, parsed.agencyId, {
        shortName: parsed.shortName,
        longName: parsed.longName,
        routeType: parsed.routeType,
      });
    }

    // 3. Stops
    if (!fs.existsSync(stopsFile)) throw new Error('stops.txt is required but missing');
    for await (const row of parseCsvStream(fs.createReadStream(stopsFile))) {
      const parsed = stopRowSchema.parse(row);
      validator.registerStop(parsed.id, {
        name: parsed.name,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      });
    }

    // 4. Calendar & CalendarDates
    const hasCalendar = fs.existsSync(calendarFile);
    const hasCalendarDates = fs.existsSync(calendarDatesFile);
    if (!hasCalendar && !hasCalendarDates) {
      throw new Error('Either calendar.txt or calendar_dates.txt must be present in the feed');
    }

    if (hasCalendar) {
      for await (const row of parseCsvStream(fs.createReadStream(calendarFile))) {
        const parsed = calendarRowSchema.parse(row);
        validator.registerCalendar(parsed.serviceId, parsed);
      }
    }

    if (hasCalendarDates) {
      for await (const row of parseCsvStream(fs.createReadStream(calendarDatesFile))) {
        const parsed = calendarDateRowSchema.parse(row);
        validator.registerCalendarDate(parsed.serviceId, parsed.date, parsed);
      }
    }

    // 5. Trips
    if (!fs.existsSync(tripsFile)) throw new Error('trips.txt is required but missing');
    for await (const row of parseCsvStream(fs.createReadStream(tripsFile))) {
      const parsed = tripRowSchema.parse(row);
      validator.registerTrip(parsed.id, parsed.routeId, parsed.serviceId, {
        directionId: parsed.directionId,
        tripHeadsign: parsed.tripHeadsign,
        shapeId: parsed.shapeId,
      });
    }

    // 6. StopTimes
    if (!fs.existsSync(stopTimesFile)) throw new Error('stop_times.txt is required but missing');
    const stopsByTrip = new Map<
      string,
      Array<{
        tripId: string;
        stopSequence: number;
        stopId: string;
        arrivalTime: string | null;
        departureTime: string | null;
        isTimepoint: boolean;
      }>
    >();

    for await (const row of parseCsvStream(fs.createReadStream(stopTimesFile))) {
      const parsed = stopTimeRowSchema.parse(row);
      validator.registerStopTime(parsed.tripId, parsed.stopSequence, parsed.stopId, {
        arrivalTime: parsed.arrivalTime,
        departureTime: parsed.departureTime,
        isTimepoint: parsed.isTimepoint,
      });

      const list = stopsByTrip.get(parsed.tripId) ?? [];
      list.push({
        tripId: parsed.tripId,
        stopSequence: parsed.stopSequence,
        stopId: parsed.stopId,
        arrivalTime: parsed.arrivalTime,
        departureTime: parsed.departureTime,
        isTimepoint: parsed.isTimepoint,
      });
      stopsByTrip.set(parsed.tripId, list);
    }

    // Monotonicity & Timing rules per trip
    for (const [, stops] of stopsByTrip.entries()) {
      validateStopSequenceMonotonicity(stops);
      validateTripTimingRules(stops);
    }

    // Finalize cross-file referential integrity
    validator.finalize();

    // =========================================================================
    // PASS 2: Atomic Persistence inside Single Transaction
    // =========================================================================
    return await this.repository.executeInTransaction(async (tx) => {
      // 1. Agency
      const agencyCount = await tx.saveAgencies([
        { id: validAgency.id, name: validAgency.name, timezone: validAgency.timezone },
      ]);

      // 2. Routes
      let routesCount = 0;
      let routeChunk = [];
      for await (const row of parseCsvStream(fs.createReadStream(routesFile))) {
        const p = routeRowSchema.parse(row);
        routeChunk.push({
          id: p.id,
          shortName: p.shortName,
          longName: p.longName,
          routeType: p.routeType,
        });
        if (routeChunk.length >= 1000) {
          routesCount += await tx.saveRoutes(routeChunk);
          routeChunk = [];
        }
      }
      if (routeChunk.length > 0) {
        routesCount += await tx.saveRoutes(routeChunk);
      }

      // 3. Stops
      let stopsCount = 0;
      let stopChunk = [];
      for await (const row of parseCsvStream(fs.createReadStream(stopsFile))) {
        const p = stopRowSchema.parse(row);
        stopChunk.push({
          id: p.id,
          name: p.name,
          latitude: p.latitude,
          longitude: p.longitude,
        });
        if (stopChunk.length >= 1000) {
          stopsCount += await tx.saveStops(stopChunk);
          stopChunk = [];
        }
      }
      if (stopChunk.length > 0) {
        stopsCount += await tx.saveStops(stopChunk);
      }

      // 4. Calendars
      let calendarsCount = 0;
      if (hasCalendar) {
        let calChunk = [];
        for await (const row of parseCsvStream(fs.createReadStream(calendarFile))) {
          const p = calendarRowSchema.parse(row);
          calChunk.push({
            serviceId: p.serviceId,
            monday: p.monday,
            tuesday: p.tuesday,
            wednesday: p.wednesday,
            thursday: p.thursday,
            friday: p.friday,
            saturday: p.saturday,
            sunday: p.sunday,
            startDate: p.startDate,
            endDate: p.endDate,
          });
          if (calChunk.length >= 1000) {
            calendarsCount += await tx.saveCalendars(calChunk);
            calChunk = [];
          }
        }
        if (calChunk.length > 0) {
          calendarsCount += await tx.saveCalendars(calChunk);
        }
      }

      // 5. CalendarDates
      let calendarDatesCount = 0;
      if (hasCalendarDates) {
        let cdChunk = [];
        for await (const row of parseCsvStream(fs.createReadStream(calendarDatesFile))) {
          const p = calendarDateRowSchema.parse(row);
          cdChunk.push({
            serviceId: p.serviceId,
            date: p.date,
            exceptionType: p.exceptionType,
          });
          if (cdChunk.length >= 1000) {
            calendarDatesCount += await tx.saveCalendarDates(cdChunk);
            cdChunk = [];
          }
        }
        if (cdChunk.length > 0) {
          calendarDatesCount += await tx.saveCalendarDates(cdChunk);
        }
      }

      // 6. Trips
      let tripsCount = 0;
      let tripChunk = [];
      for await (const row of parseCsvStream(fs.createReadStream(tripsFile))) {
        const p = tripRowSchema.parse(row);
        tripChunk.push({
          id: p.id,
          routeId: p.routeId,
          serviceId: p.serviceId,
          directionId: p.directionId,
          tripHeadsign: p.tripHeadsign,
          shapeId: p.shapeId,
        });
        if (tripChunk.length >= 1000) {
          tripsCount += await tx.saveTrips(tripChunk);
          tripChunk = [];
        }
      }
      if (tripChunk.length > 0) {
        tripsCount += await tx.saveTrips(tripChunk);
      }

      // 7. StopTimes
      let stopTimesCount = 0;
      let stChunk = [];
      for await (const row of parseCsvStream(fs.createReadStream(stopTimesFile))) {
        const p = stopTimeRowSchema.parse(row);
        stChunk.push({
          tripId: p.tripId,
          stopSequence: p.stopSequence,
          stopId: p.stopId,
          arrivalTime: p.arrivalTime,
          departureTime: p.departureTime,
          isTimepoint: p.isTimepoint,
        });
        if (stChunk.length >= 1000) {
          stopTimesCount += await tx.saveStopTimes(stChunk);
          stChunk = [];
        }
      }
      if (stChunk.length > 0) {
        stopTimesCount += await tx.saveStopTimes(stChunk);
      }

      return {
        agencyCount,
        routesCount,
        stopsCount,
        calendarsCount,
        calendarDatesCount,
        tripsCount,
        stopTimesCount,
      };
    }, options);
  }
}
