export interface GtfsAgencyRecord {
  id: string;
  name: string;
  timezone: string;
}

export interface GtfsCalendarRecord {
  serviceId: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startDate: string;
  endDate: string;
}

export interface GtfsCalendarDateRecord {
  serviceId: string;
  date: string;
  exceptionType: number;
}

export interface GtfsRouteRecord {
  id: string;
  shortName: string;
  longName: string;
  routeType: number;
}

export interface GtfsStopRecord {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface GtfsTripRecord {
  id: string;
  routeId: string;
  serviceId: string;
  directionId: number;
  tripHeadsign: string | null;
  shapeId: string | null;
}

export interface GtfsStopTimeRecord {
  tripId: string;
  stopSequence: number;
  stopId: string;
  arrivalTime: string | null;
  departureTime: string | null;
  isTimepoint: boolean;
}

export interface TransactionOptions {
  timeoutMs?: number;
  maxWaitMs?: number;
}

export interface GtfsTransactionalRepository {
  saveAgencies(agencies: GtfsAgencyRecord[]): Promise<number>;
  saveCalendars(calendars: GtfsCalendarRecord[]): Promise<number>;
  saveCalendarDates(calendarDates: GtfsCalendarDateRecord[]): Promise<number>;
  saveRoutes(routes: GtfsRouteRecord[]): Promise<number>;
  saveStops(stops: GtfsStopRecord[]): Promise<number>;
  saveTrips(trips: GtfsTripRecord[]): Promise<number>;
  saveStopTimes(stopTimes: GtfsStopTimeRecord[]): Promise<number>;

  findAgencyById(id: string): Promise<GtfsAgencyRecord | null>;
  findCalendarById(serviceId: string): Promise<GtfsCalendarRecord | null>;
  findCalendarDateByKey(serviceId: string, date: string): Promise<GtfsCalendarDateRecord | null>;
  findRouteById(id: string): Promise<GtfsRouteRecord | null>;
  findStopById(id: string): Promise<GtfsStopRecord | null>;
  findTripById(id: string): Promise<GtfsTripRecord | null>;
  findStopTimeByKey(tripId: string, stopSequence: number): Promise<GtfsStopTimeRecord | null>;
}

export interface GtfsRepository {
  executeInTransaction<T>(
    work: (txRepo: GtfsTransactionalRepository) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T>;
}
