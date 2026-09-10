export interface RouteSummaryDto {
  id: string;
  shortName: string;
  longName: string;
  routeType: number;
}

export interface RouteStopTimeDto {
  stopSequence: number;
  stopId: string;
  stopName: string;
  arrivalTime: string | null;
  departureTime: string | null;
  isTimepoint: boolean;
}

export interface RouteTripDetailDto {
  tripId: string;
  serviceId: string;
  directionId: number;
  tripHeadsign: string | null;
  shapeId: string | null;
  stopTimes: RouteStopTimeDto[];
}

export interface RouteTripAggregateDto {
  route: RouteSummaryDto;
  trips: RouteTripDetailDto[];
}

export interface RouteVariantStopDto {
  stopSequence: number;
  stopId: string;
  stopName: string;
  isTimepoint: boolean;
}

export interface RouteVariantDto {
  variantKey: string;
  routeId: string;
  directionId: number;
  headsign: string | null;
  stopCount: number;
  sampleTripId: string;
  tripCount: number;
  orderedStops: RouteVariantStopDto[];
}

export interface GtfsReadRepository {
  /**
   * Retrieves all persisted GTFS routes in deterministic order (shortName ASC, id ASC).
   * Does not filter by active calendar or service date.
   */
  findAllRoutes(): Promise<RouteSummaryDto[]>;

  /**
   * Retrieves route metadata along with all associated trips and ordered stop times
   * using a bounded query strategy to prevent N+1 loop queries.
   * Returns null if the route is not found.
   */
  findTripsWithStopTimesByRouteId(routeId: string): Promise<RouteTripAggregateDto | null>;
}
