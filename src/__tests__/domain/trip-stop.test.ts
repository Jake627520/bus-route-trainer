import { describe, it, expect } from 'vitest';
import { TripStop } from '@/domain/trip/trip-stop';
import { GtfsTime } from '@/domain/shared/gtfs-time';

describe('TripStop Entity', () => {
  it('instantiates correctly with independent arrival and departure times', () => {
    const tripStop = new TripStop({
      tripId: 'TRIP_01',
      stopSequence: 1,
      stopId: 'STOP_100',
      arrivalTime: GtfsTime.fromString('08:10:00'),
      departureTime: GtfsTime.fromString('08:11:00'),
      isTimepoint: true,
    });

    expect(tripStop.tripId).toBe('TRIP_01');
    expect(tripStop.stopSequence).toBe(1);
    expect(tripStop.stopId).toBe('STOP_100');
    expect(tripStop.arrivalTime?.toString()).toBe('08:10:00');
    expect(tripStop.departureTime?.toString()).toBe('08:11:00');
    expect(tripStop.isTimepoint).toBe(true);
  });

  it('preserves missing (null) arrival and departure semantics without fabricating times', () => {
    const interpolatedStop = new TripStop({
      tripId: 'TRIP_01',
      stopSequence: 2,
      stopId: 'STOP_101',
      arrivalTime: null,
      departureTime: null,
      isTimepoint: false,
    });

    expect(interpolatedStop.arrivalTime).toBeNull();
    expect(interpolatedStop.departureTime).toBeNull();
    expect(interpolatedStop.isTimepoint).toBe(false);
  });

  it('allows present arrival with missing departure and vice versa', () => {
    const terminusStop = new TripStop({
      tripId: 'TRIP_01',
      stopSequence: 10,
      stopId: 'STOP_TERMINUS',
      arrivalTime: GtfsTime.fromString('09:00:00'),
      departureTime: null,
      isTimepoint: true,
    });

    expect(terminusStop.arrivalTime?.toString()).toBe('09:00:00');
    expect(terminusStop.departureTime).toBeNull();
  });

  it('rejects negative or zero stopSequence', () => {
    expect(() => {
      new TripStop({
        tripId: 'TRIP_01',
        stopSequence: 0,
        stopId: 'STOP_100',
        arrivalTime: null,
        departureTime: null,
        isTimepoint: false,
      });
    }).toThrow(/stopSequence must be a positive integer/);
  });
});
