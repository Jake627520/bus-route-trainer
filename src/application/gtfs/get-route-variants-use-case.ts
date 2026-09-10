import { GtfsReadRepository, RouteVariantDto } from './gtfs-read-repository.port';
import { GtfsTime } from '@/domain/shared/gtfs-time';
import { TripStop } from '@/domain/trip/trip-stop';
import { StopSequence } from '@/domain/trip/stop-sequence';
import { DirectionId, Trip } from '@/domain/route/route';
import { groupTripsIntoRouteVariants, TripWithSequence } from '@/domain/route/route-variant';

export class RouteNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteNotFoundError';
  }
}

export class GetRouteVariantsUseCase {
  constructor(private readonly readRepository: GtfsReadRepository) {}

  public async execute(routeId: string): Promise<RouteVariantDto[]> {
    const aggregate = await this.readRepository.findTripsWithStopTimesByRouteId(routeId);

    if (!aggregate) {
      throw new RouteNotFoundError(`Route with id '${routeId}' was not found`);
    }

    if (aggregate.trips.length === 0) {
      return [];
    }

    const tripsMap = new Map(aggregate.trips.map((t) => [t.tripId, t]));
    const tripsWithSequences: TripWithSequence[] = [];

    for (const tripDto of aggregate.trips) {
      const tripStops = tripDto.stopTimes.map(
        (st) =>
          new TripStop({
            tripId: tripDto.tripId,
            stopSequence: st.stopSequence,
            stopId: st.stopId,
            arrivalTime:
              st.arrivalTime !== null ? GtfsTime.fromString(st.arrivalTime) : null,
            departureTime:
              st.departureTime !== null ? GtfsTime.fromString(st.departureTime) : null,
            isTimepoint: st.isTimepoint,
          })
      );

      const sequence = new StopSequence(tripDto.tripId, tripStops);
      const trip = new Trip({
        id: tripDto.tripId,
        routeId: aggregate.route.id,
        serviceId: tripDto.serviceId,
        directionId: tripDto.directionId === 1 ? DirectionId.INBOUND : DirectionId.OUTBOUND,
        tripHeadsign: tripDto.tripHeadsign,
        shapeId: tripDto.shapeId,
      });

      tripsWithSequences.push({ trip, sequence });
    }

    // Call existing domain algorithm from Change 01
    const domainVariants = groupTripsIntoRouteVariants(routeId, tripsWithSequences);

    const result: RouteVariantDto[] = [];

    for (const variant of domainVariants) {
      // 1. Deterministic sampleTripId: lexicographically smallest tripId
      const sortedTripIds = [...variant.tripIds].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
      );
      const sampleTripId = sortedTripIds[0];
      const sampleTripDto = tripsMap.get(sampleTripId);

      if (!sampleTripDto) continue;

      // 2. Deterministic representative headsign: lexicographically smallest non-null headsign
      const nonNullHeadsigns = variant.tripIds
        .map((tid) => tripsMap.get(tid)?.tripHeadsign)
        .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      const headsign = nonNullHeadsigns.length > 0 ? nonNullHeadsigns[0] : null;

      // 3. Deterministic orderedStops: strictly derived from sampleTripId
      const orderedStops = sampleTripDto.stopTimes.map((st) => ({
        stopSequence: st.stopSequence,
        stopId: st.stopId,
        stopName: st.stopName,
        isTimepoint: st.isTimepoint,
      }));

      result.push({
        variantKey: variant.id,
        routeId,
        directionId: variant.directionId,
        headsign,
        stopCount: orderedStops.length,
        sampleTripId,
        tripCount: variant.tripIds.length,
        orderedStops,
      });
    }

    // Sort variants deterministically: directionId ASC, then variantKey ASC
    result.sort((a, b) => {
      if (a.directionId !== b.directionId) return a.directionId - b.directionId;
      return a.variantKey < b.variantKey ? -1 : a.variantKey > b.variantKey ? 1 : 0;
    });

    return result;
  }
}
