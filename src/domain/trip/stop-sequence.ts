import { TripStop } from './trip-stop';

/**
 * StopSequence Aggregate
 *
 * Encapsulates the ordered sequence of stops visited by a specific trip.
 * Guarantees that internal stops are always ordered strictly by stopSequence ascending,
 * rejects duplicate stopSequence values, and provides navigational domain query methods.
 */
export class StopSequence {
  public readonly tripId: string;
  private readonly orderedStops: TripStop[];

  constructor(tripId: string, stops: TripStop[]) {
    if (!tripId) {
      throw new Error('tripId must not be empty');
    }

    const seenSequences = new Set<number>();
    for (const stop of stops) {
      if (stop.tripId !== tripId) {
        throw new Error(
          `All stops in StopSequence must belong to trip "${tripId}", received "${stop.tripId}"`
        );
      }
      if (seenSequences.has(stop.stopSequence)) {
        throw new Error(
          `Duplicate stopSequence detected in trip "${tripId}": sequence ${stop.stopSequence}`
        );
      }
      seenSequences.add(stop.stopSequence);
    }

    this.tripId = tripId;
    // Sort immutably by stopSequence ascending
    this.orderedStops = [...stops].sort((a, b) => a.stopSequence - b.stopSequence);
    Object.freeze(this.orderedStops);
    Object.freeze(this);
  }

  public get length(): number {
    return this.orderedStops.length;
  }

  public getStops(): readonly TripStop[] {
    return this.orderedStops;
  }

  public getFirstStop(): TripStop | null {
    return this.orderedStops.length > 0 ? this.orderedStops[0] : null;
  }

  public getLastStop(): TripStop | null {
    return this.orderedStops.length > 0 ? this.orderedStops[this.orderedStops.length - 1] : null;
  }

  public getStopAtSequence(sequence: number): TripStop | null {
    const found = this.orderedStops.find((s) => s.stopSequence === sequence);
    return found ?? null;
  }

  public getNextStop(currentStopId: string): TripStop | null {
    const idx = this.orderedStops.findIndex((s) => s.stopId === currentStopId);
    if (idx === -1 || idx >= this.orderedStops.length - 1) {
      return null;
    }
    return this.orderedStops[idx + 1];
  }

  public getPreviousStop(currentStopId: string): TripStop | null {
    const idx = this.orderedStops.findIndex((s) => s.stopId === currentStopId);
    if (idx <= 0) {
      return null;
    }
    return this.orderedStops[idx - 1];
  }
}
