import { Prisma, PrismaClient } from '@prisma/client';
import {
  GtfsAgencyRecord,
  GtfsCalendarDateRecord,
  GtfsCalendarRecord,
  GtfsRepository,
  GtfsRouteRecord,
  GtfsStopTimeRecord,
  GtfsStopRecord,
  GtfsTransactionalRepository,
  GtfsTripRecord,
  TransactionOptions,
} from '@/application/gtfs/gtfs-repository.port';
import { ImportConflictError } from '@/application/gtfs/cross-file-validator';

export class PrismaGtfsTransactionalRepository implements GtfsTransactionalRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  public async saveAgencies(agencies: GtfsAgencyRecord[]): Promise<number> {
    if (agencies.length === 0) return 0;
    const ids = agencies.map((a) => a.id);
    const existing = await this.tx.gtfsAgency.findMany({
      where: { id: { in: ids } },
    });
    const existingMap = new Map(existing.map((e) => [e.id, e]));

    const toCreate: GtfsAgencyRecord[] = [];
    for (const agency of agencies) {
      const found = existingMap.get(agency.id);
      if (found) {
        if (found.name !== agency.name || found.timezone !== agency.timezone) {
          throw new ImportConflictError(
            `Database conflict: Agency "${agency.id}" exists with different payload.`
          );
        }
      } else {
        toCreate.push(agency);
      }
    }

    if (toCreate.length > 0) {
      await this.tx.gtfsAgency.createMany({ data: toCreate });
    }
    return toCreate.length;
  }

  public async saveCalendars(calendars: GtfsCalendarRecord[]): Promise<number> {
    if (calendars.length === 0) return 0;
    const ids = calendars.map((c) => c.serviceId);
    const existing = await this.tx.gtfsCalendar.findMany({
      where: { serviceId: { in: ids } },
    });
    const existingMap = new Map(existing.map((e) => [e.serviceId, e]));

    const toCreate: GtfsCalendarRecord[] = [];
    for (const cal of calendars) {
      const found = existingMap.get(cal.serviceId);
      if (found) {
        if (
          found.monday !== cal.monday ||
          found.tuesday !== cal.tuesday ||
          found.wednesday !== cal.wednesday ||
          found.thursday !== cal.thursday ||
          found.friday !== cal.friday ||
          found.saturday !== cal.saturday ||
          found.sunday !== cal.sunday ||
          found.startDate !== cal.startDate ||
          found.endDate !== cal.endDate
        ) {
          throw new ImportConflictError(
            `Database conflict: Calendar "${cal.serviceId}" exists with different payload.`
          );
        }
      } else {
        toCreate.push(cal);
      }
    }

    if (toCreate.length > 0) {
      await this.tx.gtfsCalendar.createMany({ data: toCreate });
    }
    return toCreate.length;
  }

  public async saveCalendarDates(calendarDates: GtfsCalendarDateRecord[]): Promise<number> {
    if (calendarDates.length === 0) return 0;
    const conditions = calendarDates.map((cd) => ({ serviceId: cd.serviceId, date: cd.date }));
    const existing = await this.tx.gtfsCalendarDate.findMany({
      where: { OR: conditions },
    });
    const existingMap = new Map(existing.map((e) => [`${e.serviceId}_${e.date}`, e]));

    const toCreate: GtfsCalendarDateRecord[] = [];
    for (const cd of calendarDates) {
      const key = `${cd.serviceId}_${cd.date}`;
      const found = existingMap.get(key);
      if (found) {
        if (found.exceptionType !== cd.exceptionType) {
          throw new ImportConflictError(
            `Database conflict: CalendarDate "${key}" exists with different payload.`
          );
        }
      } else {
        toCreate.push(cd);
      }
    }

    if (toCreate.length > 0) {
      await this.tx.gtfsCalendarDate.createMany({ data: toCreate });
    }
    return toCreate.length;
  }

  public async saveRoutes(routes: GtfsRouteRecord[]): Promise<number> {
    if (routes.length === 0) return 0;
    const ids = routes.map((r) => r.id);
    const existing = await this.tx.gtfsRoute.findMany({
      where: { id: { in: ids } },
    });
    const existingMap = new Map(existing.map((e) => [e.id, e]));

    const toCreate: GtfsRouteRecord[] = [];
    for (const route of routes) {
      const found = existingMap.get(route.id);
      if (found) {
        if (
          found.shortName !== route.shortName ||
          found.longName !== route.longName ||
          found.routeType !== route.routeType
        ) {
          throw new ImportConflictError(
            `Database conflict: Route "${route.id}" exists with different payload.`
          );
        }
      } else {
        toCreate.push(route);
      }
    }

    if (toCreate.length > 0) {
      await this.tx.gtfsRoute.createMany({ data: toCreate });
    }
    return toCreate.length;
  }

  public async saveStops(stops: GtfsStopRecord[]): Promise<number> {
    if (stops.length === 0) return 0;
    const ids = stops.map((s) => s.id);
    const existing = await this.tx.gtfsStop.findMany({
      where: { id: { in: ids } },
    });
    const existingMap = new Map(existing.map((e) => [e.id, e]));

    const toCreate: GtfsStopRecord[] = [];
    for (const stop of stops) {
      const found = existingMap.get(stop.id);
      if (found) {
        if (
          found.name !== stop.name ||
          Math.abs(found.latitude - stop.latitude) > 1e-6 ||
          Math.abs(found.longitude - stop.longitude) > 1e-6
        ) {
          throw new ImportConflictError(
            `Database conflict: Stop "${stop.id}" exists with different payload.`
          );
        }
      } else {
        toCreate.push(stop);
      }
    }

    if (toCreate.length > 0) {
      await this.tx.gtfsStop.createMany({ data: toCreate });
    }
    return toCreate.length;
  }

  public async saveTrips(trips: GtfsTripRecord[]): Promise<number> {
    if (trips.length === 0) return 0;
    const ids = trips.map((t) => t.id);
    const existing = await this.tx.gtfsTrip.findMany({
      where: { id: { in: ids } },
    });
    const existingMap = new Map(existing.map((e) => [e.id, e]));

    const toCreate: GtfsTripRecord[] = [];
    for (const trip of trips) {
      const found = existingMap.get(trip.id);
      if (found) {
        if (
          found.routeId !== trip.routeId ||
          found.serviceId !== trip.serviceId ||
          found.directionId !== trip.directionId ||
          found.tripHeadsign !== trip.tripHeadsign ||
          found.shapeId !== trip.shapeId
        ) {
          throw new ImportConflictError(
            `Database conflict: Trip "${trip.id}" exists with different payload.`
          );
        }
      } else {
        toCreate.push(trip);
      }
    }

    if (toCreate.length > 0) {
      await this.tx.gtfsTrip.createMany({ data: toCreate });
    }
    return toCreate.length;
  }

  public async saveStopTimes(stopTimes: GtfsStopTimeRecord[]): Promise<number> {
    if (stopTimes.length === 0) return 0;
    const conditions = stopTimes.map((st) => ({
      tripId: st.tripId,
      stopSequence: st.stopSequence,
    }));
    const existing = await this.tx.gtfsStopTime.findMany({
      where: { OR: conditions },
    });
    const existingMap = new Map(existing.map((e) => [`${e.tripId}_${e.stopSequence}`, e]));

    const toCreate: GtfsStopTimeRecord[] = [];
    for (const st of stopTimes) {
      const key = `${st.tripId}_${st.stopSequence}`;
      const found = existingMap.get(key);
      if (found) {
        if (
          found.stopId !== st.stopId ||
          found.arrivalTime !== st.arrivalTime ||
          found.departureTime !== st.departureTime ||
          found.isTimepoint !== st.isTimepoint
        ) {
          throw new ImportConflictError(
            `Database conflict: StopTime "${key}" exists with different payload.`
          );
        }
      } else {
        toCreate.push(st);
      }
    }

    if (toCreate.length > 0) {
      await this.tx.gtfsStopTime.createMany({ data: toCreate });
    }
    return toCreate.length;
  }

  public async findAgencyById(id: string): Promise<GtfsAgencyRecord | null> {
    const found = await this.tx.gtfsAgency.findUnique({ where: { id } });
    if (!found) return null;
    return { id: found.id, name: found.name, timezone: found.timezone };
  }

  public async findCalendarById(serviceId: string): Promise<GtfsCalendarRecord | null> {
    const found = await this.tx.gtfsCalendar.findUnique({ where: { serviceId } });
    if (!found) return null;
    return {
      serviceId: found.serviceId,
      monday: found.monday,
      tuesday: found.tuesday,
      wednesday: found.wednesday,
      thursday: found.thursday,
      friday: found.friday,
      saturday: found.saturday,
      sunday: found.sunday,
      startDate: found.startDate,
      endDate: found.endDate,
    };
  }

  public async findCalendarDateByKey(
    serviceId: string,
    date: string
  ): Promise<GtfsCalendarDateRecord | null> {
    const found = await this.tx.gtfsCalendarDate.findUnique({
      where: { serviceId_date: { serviceId, date } },
    });
    if (!found) return null;
    return {
      serviceId: found.serviceId,
      date: found.date,
      exceptionType: found.exceptionType,
    };
  }

  public async findRouteById(id: string): Promise<GtfsRouteRecord | null> {
    const found = await this.tx.gtfsRoute.findUnique({ where: { id } });
    if (!found) return null;
    return {
      id: found.id,
      shortName: found.shortName,
      longName: found.longName,
      routeType: found.routeType,
    };
  }

  public async findStopById(id: string): Promise<GtfsStopRecord | null> {
    const found = await this.tx.gtfsStop.findUnique({ where: { id } });
    if (!found) return null;
    return {
      id: found.id,
      name: found.name,
      latitude: found.latitude,
      longitude: found.longitude,
    };
  }

  public async findTripById(id: string): Promise<GtfsTripRecord | null> {
    const found = await this.tx.gtfsTrip.findUnique({ where: { id } });
    if (!found) return null;
    return {
      id: found.id,
      routeId: found.routeId,
      serviceId: found.serviceId,
      directionId: found.directionId,
      tripHeadsign: found.tripHeadsign,
      shapeId: found.shapeId,
    };
  }

  public async findStopTimeByKey(
    tripId: string,
    stopSequence: number
  ): Promise<GtfsStopTimeRecord | null> {
    const found = await this.tx.gtfsStopTime.findUnique({
      where: { tripId_stopSequence: { tripId, stopSequence } },
    });
    if (!found) return null;
    return {
      tripId: found.tripId,
      stopSequence: found.stopSequence,
      stopId: found.stopId,
      arrivalTime: found.arrivalTime,
      departureTime: found.departureTime,
      isTimepoint: found.isTimepoint,
    };
  }
}

export class PrismaGtfsRepository implements GtfsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async executeInTransaction<T>(
    work: (txRepo: GtfsTransactionalRepository) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    return await this.prisma.$transaction(
      async (tx) => {
        const txRepo = new PrismaGtfsTransactionalRepository(tx);
        return await work(txRepo);
      },
      {
        timeout: options?.timeoutMs ?? 60000,
        maxWait: options?.maxWaitMs ?? 10000,
      }
    );
  }
}
