export enum DirectionId {
  OUTBOUND = 0,
  INBOUND = 1,
}

export interface RouteProps {
  id: string; // route_id
  shortName: string; // route_short_name (e.g. "66")
  longName: string; // route_long_name
  routeType: number; // 3 = Bus
}

export class Route {
  public readonly id: string;
  public readonly shortName: string;
  public readonly longName: string;
  public readonly routeType: number;

  constructor(props: RouteProps) {
    if (!props.id) throw new Error('routeId must not be empty');
    if (!props.shortName && !props.longName) {
      throw new Error('Route must have at least a shortName or longName');
    }
    this.id = props.id;
    this.shortName = props.shortName;
    this.longName = props.longName;
    this.routeType = props.routeType;
    Object.freeze(this);
  }
}

export interface TripProps {
  id: string; // trip_id
  routeId: string;
  serviceId: string;
  directionId?: DirectionId;
  tripHeadsign?: string | null;
  shapeId?: string | null;
}

export class Trip {
  public readonly id: string;
  public readonly routeId: string;
  public readonly serviceId: string;
  public readonly directionId: DirectionId;
  public readonly tripHeadsign: string | null;
  public readonly shapeId: string | null;

  constructor(props: TripProps) {
    if (!props.id) throw new Error('tripId must not be empty');
    if (!props.routeId) throw new Error('routeId must not be empty');
    if (!props.serviceId) throw new Error('serviceId must not be empty');

    this.id = props.id;
    this.routeId = props.routeId;
    this.serviceId = props.serviceId;
    this.directionId = props.directionId ?? DirectionId.OUTBOUND;
    this.tripHeadsign = props.tripHeadsign ?? null;
    this.shapeId = props.shapeId ?? null;
    Object.freeze(this);
  }
}
