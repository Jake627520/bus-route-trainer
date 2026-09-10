import { describe, it, expect } from 'vitest';
import { InMemoryGtfsStore, GtfsFeedPayload, importGtfsFeed } from '@/domain/gtfs/gtfs-import-boundary';

describe('GTFS Import Boundary Idempotency', () => {
  const sampleFeed: GtfsFeedPayload = {
    agency: [{ id: 'TRANS_QLD', name: 'Translink Queensland', timezone: 'Australia/Brisbane' }],
    routes: [{ id: 'R66', shortName: '66', longName: 'RBWH - UQ Lakes', routeType: 3 }],
    trips: [
      { id: 'T66_01', routeId: 'R66', serviceId: 'S_WD', directionId: 0, tripHeadsign: 'UQ Lakes', shapeId: null },
      { id: 'T66_02', routeId: 'R66', serviceId: 'S_WD', directionId: 1, tripHeadsign: 'RBWH', shapeId: null },
    ],
    stops: [
      { id: 'ST_01', name: 'RBWH Station', latitude: -27.4475, longitude: 153.0281 },
      { id: 'ST_02', name: 'Cultural Centre', latitude: -27.4741, longitude: 153.0189 },
      { id: 'ST_03', name: 'UQ Lakes Station', latitude: -27.4988, longitude: 153.0163 },
    ],
    stopTimes: [
      { tripId: 'T66_01', stopSequence: 1, stopId: 'ST_01', arrivalTime: '08:00:00', departureTime: '08:00:00', isTimepoint: true },
      { tripId: 'T66_01', stopSequence: 2, stopId: 'ST_02', arrivalTime: '08:15:00', departureTime: '08:16:00', isTimepoint: true },
      { tripId: 'T66_01', stopSequence: 3, stopId: 'ST_03', arrivalTime: '08:30:00', departureTime: '08:30:00', isTimepoint: true },
    ],
    calendars: [
      { serviceId: 'S_WD', monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false, startDate: '20260901', endDate: '20260930' },
    ],
    calendarDates: [
      { serviceId: 'S_WD', date: '20260907', exceptionType: 2 },
    ],
  };

  it('first import successfully populates stores', () => {
    const store = new InMemoryGtfsStore();
    const result = importGtfsFeed(store, sampleFeed);

    expect(result.routesImported).toBe(1);
    expect(result.tripsImported).toBe(2);
    expect(result.stopsImported).toBe(3);
    expect(result.stopTimesImported).toBe(3);
    expect(result.calendarsImported).toBe(1);
    expect(result.calendarDatesImported).toBe(1);

    expect(store.routes.size).toBe(1);
    expect(store.trips.size).toBe(2);
    expect(store.stops.size).toBe(3);
    expect(store.stopTimes.size).toBe(3);
  });

  it('second identical import guarantees strict idempotency (zero duplicates, zero count inflation)', () => {
    const store = new InMemoryGtfsStore();

    // 1st Run
    importGtfsFeed(store, sampleFeed);
    const initialRouteCount = store.routes.size;
    const initialTripCount = store.trips.size;
    const initialStopCount = store.stops.size;
    const initialStopTimeCount = store.stopTimes.size;
    const initialCalendarCount = store.calendars.size;

    // 2nd Run (Re-import identical feed)
    const secondResult = importGtfsFeed(store, sampleFeed);

    expect(store.routes.size).toBe(initialRouteCount);
    expect(store.trips.size).toBe(initialTripCount);
    expect(store.stops.size).toBe(initialStopCount);
    expect(store.stopTimes.size).toBe(initialStopTimeCount);
    expect(store.calendars.size).toBe(initialCalendarCount);

    expect(secondResult.duplicatesDetected).toBe(0);
    expect(secondResult.errors).toEqual([]);
  });
});
