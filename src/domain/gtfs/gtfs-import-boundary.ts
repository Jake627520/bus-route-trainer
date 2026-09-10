export interface RawAgency {
  id: string;
  name: string;
  timezone: string;
}

export interface RawRoute {
  id: string;
  shortName: string;
  longName: string;
  routeType: number;
}

export interface RawTrip {
  id: string;
  routeId: string;
  serviceId: string;
  directionId: number;
  tripHeadsign: string | null;
  shapeId: string | null;
}

export interface RawStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface RawStopTime {
  tripId: string;
  stopSequence: number;
  stopId: string;
  arrivalTime: string;
  departureTime: string;
  isTimepoint?: boolean;
}

export interface RawCalendar {
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

export interface RawCalendarDate {
  serviceId: string;
  date: string;
  exceptionType: number;
}

export interface GtfsFeedPayload {
  agency: RawAgency[];
  routes: RawRoute[];
  trips: RawTrip[];
  stops: RawStop[];
  stopTimes: RawStopTime[];
  calendars: RawCalendar[];
  calendarDates: RawCalendarDate[];
}

export interface ImportResult {
  routesImported: number;
  tripsImported: number;
  stopsImported: number;
  stopTimesImported: number;
  calendarsImported: number;
  calendarDatesImported: number;
  duplicatesDetected: number;
  errors: string[];
}

/**
 * In-Memory GTFS Repository Store for boundary testing
 */
export class InMemoryGtfsStore {
  public agency = new Map<string, RawAgency>();
  public routes = new Map<string, RawRoute>();
  public trips = new Map<string, RawTrip>();
  public stops = new Map<string, RawStop>();
  // Keyed by composite key: `${tripId}_${stopSequence}`
  public stopTimes = new Map<string, RawStopTime>();
  public calendars = new Map<string, RawCalendar>();
  // Keyed by composite key: `${serviceId}_${date}`
  public calendarDates = new Map<string, RawCalendarDate>();
}

/**
 * Idempotent GTFS Import Boundary Function
 *
 * Guarantees that applying the same feed multiple times updates in-place
 * rather than creating duplicate records or violating cardinality.
 */
export function importGtfsFeed(store: InMemoryGtfsStore, feed: GtfsFeedPayload): ImportResult {
  const result: ImportResult = {
    routesImported: 0,
    tripsImported: 0,
    stopsImported: 0,
    stopTimesImported: 0,
    calendarsImported: 0,
    calendarDatesImported: 0,
    duplicatesDetected: 0,
    errors: [],
  };

  // 1. Agency
  for (const ag of feed.agency) {
    store.agency.set(ag.id, ag);
  }

  // 2. Routes
  for (const route of feed.routes) {
    store.routes.set(route.id, route);
    result.routesImported++;
  }

  // 3. Trips
  for (const trip of feed.trips) {
    store.trips.set(trip.id, trip);
    result.tripsImported++;
  }

  // 4. Stops
  for (const stop of feed.stops) {
    store.stops.set(stop.id, stop);
    result.stopsImported++;
  }

  // 5. StopTimes (Strict composite identity: tripId + stopSequence)
  for (const st of feed.stopTimes) {
    const key = `${st.tripId}_${st.stopSequence}`;
    store.stopTimes.set(key, st);
    result.stopTimesImported++;
  }

  // 6. Calendars
  for (const cal of feed.calendars) {
    store.calendars.set(cal.serviceId, cal);
    result.calendarsImported++;
  }

  // 7. CalendarDates (Composite identity: serviceId + date)
  for (const cd of feed.calendarDates) {
    const key = `${cd.serviceId}_${cd.date}`;
    store.calendarDates.set(key, cd);
    result.calendarDatesImported++;
  }

  return result;
}
