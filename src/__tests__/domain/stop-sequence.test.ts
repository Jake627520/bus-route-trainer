import { describe, it, expect } from 'vitest';
import { StopSequence } from '@/domain/trip/stop-sequence';
import { TripStop } from '@/domain/trip/trip-stop';
import { GtfsTime } from '@/domain/shared/gtfs-time';

describe('StopSequence Aggregate', () => {
  const createStop = (seq: number, id: string) =>
    new TripStop({
      tripId: 'TRIP_TEST',
      stopSequence: seq,
      stopId: id,
      arrivalTime: GtfsTime.fromString('08:00:00'),
      departureTime: GtfsTime.fromString('08:01:00'),
      isTimepoint: true,
    });

  it('sorts out-of-order input strictly by stopSequence ascending', () => {
    // Input order: 3 C, 1 A, 2 B
    const unsorted = [createStop(3, 'STOP_C'), createStop(1, 'STOP_A'), createStop(2, 'STOP_B')];
    const sequence = new StopSequence('TRIP_TEST', unsorted);

    expect(sequence.length).toBe(3);
    expect(sequence.getFirstStop()?.stopId).toBe('STOP_A');
    expect(sequence.getLastStop()?.stopId).toBe('STOP_C');
    expect(sequence.getStopAtSequence(1)?.stopId).toBe('STOP_A');
    expect(sequence.getStopAtSequence(2)?.stopId).toBe('STOP_B');
    expect(sequence.getStopAtSequence(3)?.stopId).toBe('STOP_C');
  });

  it('navigates next and previous stops correctly', () => {
    const stops = [createStop(1, 'STOP_A'), createStop(2, 'STOP_B'), createStop(3, 'STOP_C')];
    const sequence = new StopSequence('TRIP_TEST', stops);

    // Case A: Next stop
    expect(sequence.getNextStop('STOP_A')?.stopId).toBe('STOP_B');
    expect(sequence.getNextStop('STOP_B')?.stopId).toBe('STOP_C');
    expect(sequence.getNextStop('STOP_C')).toBeNull(); // Last stop boundary

    // Case B: Previous stop
    expect(sequence.getPreviousStop('STOP_A')).toBeNull(); // First stop boundary
    expect(sequence.getPreviousStop('STOP_B')?.stopId).toBe('STOP_A');
    expect(sequence.getPreviousStop('STOP_C')?.stopId).toBe('STOP_B');
  });

  it('handles unknown stopId gracefully returning null for next/previous', () => {
    const stops = [createStop(1, 'STOP_A'), createStop(2, 'STOP_B')];
    const sequence = new StopSequence('TRIP_TEST', stops);

    expect(sequence.getNextStop('STOP_UNKNOWN')).toBeNull();
    expect(sequence.getPreviousStop('STOP_UNKNOWN')).toBeNull();
    expect(sequence.getStopAtSequence(999)).toBeNull();
  });

  it('rejects duplicate stopSequence numbers within the same trip', () => {
    // 1 A, 1 B is invalid in GTFS
    const duplicates = [createStop(1, 'STOP_A'), createStop(1, 'STOP_B')];
    expect(() => new StopSequence('TRIP_TEST', duplicates)).toThrow(
      /Duplicate stopSequence detected/
    );
  });

  it('rejects stops belonging to mismatched tripIds', () => {
    const mismatched = [
      createStop(1, 'STOP_A'),
      new TripStop({
        tripId: 'DIFFERENT_TRIP',
        stopSequence: 2,
        stopId: 'STOP_B',
        arrivalTime: null,
        departureTime: null,
      }),
    ];

    expect(() => new StopSequence('TRIP_TEST', mismatched)).toThrow(
      /All stops in StopSequence must belong to trip/
    );
  });
});
