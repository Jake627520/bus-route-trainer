import { GtfsTime } from '../shared/gtfs-time';

export interface TripStopProps {
  tripId: string;
  stopSequence: number;
  stopId: string;
  arrivalTime: GtfsTime | null;
  departureTime: GtfsTime | null;
  isTimepoint?: boolean;
}

/**
 * TripStop Entity
 *
 * Represents an individual scheduled stop along a specific trip in GTFS stop_times.
 * Preserves independent arrival and departure times (nullable without fabrication)
 * and whether the stop is a designated timepoint.
 */
export class TripStop {
  public readonly tripId: string;
  public readonly stopSequence: number;
  public readonly stopId: string;
  public readonly arrivalTime: GtfsTime | null;
  public readonly departureTime: GtfsTime | null;
  public readonly isTimepoint: boolean;

  constructor(props: TripStopProps) {
    if (!props.tripId || typeof props.tripId !== 'string') {
      throw new Error('tripId must be a non-empty string');
    }
    if (!props.stopId || typeof props.stopId !== 'string') {
      throw new Error('stopId must be a non-empty string');
    }
    if (!Number.isInteger(props.stopSequence) || props.stopSequence < 1) {
      throw new Error(`stopSequence must be a positive integer (>= 1): ${props.stopSequence}`);
    }

    this.tripId = props.tripId;
    this.stopSequence = props.stopSequence;
    this.stopId = props.stopId;
    this.arrivalTime = props.arrivalTime;
    this.departureTime = props.departureTime;
    this.isTimepoint = props.isTimepoint ?? true;
    Object.freeze(this);
  }
}
