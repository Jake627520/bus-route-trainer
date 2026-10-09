import { DirectionId, Trip } from './route';
import { StopSequence } from '../trip/stop-sequence';

export interface RouteVariant {
  id: string; // Deterministic variant signature
  routeId: string;
  directionId: DirectionId;
  stopIds: string[];
  tripIds: string[];
}

export interface TripWithSequence {
  trip: Trip;
  sequence: StopSequence;
}

/**
 * RouteVariant Grouper
 *
 * Deterministically aggregates trips belonging to a route into distinct variants.
 * Two trips belong to the same variant iff they share:
 * 1. The exact same directionId
 * 2. The exact same ordered stop ID sequence
 */
export function groupTripsIntoRouteVariants(
  routeId: string,
  tripsWithSequences: TripWithSequence[]
): RouteVariant[] {
  const variantMap = new Map<string, RouteVariant>();

  for (const item of tripsWithSequences) {
    const { trip, sequence } = item;
    if (trip.routeId !== routeId) continue;

    const stopIds = sequence.getStops().map((s) => s.stopId);
    const signature = `${routeId}_DIR${trip.directionId}_${stopIds.join('>')}`;

    if (!variantMap.has(signature)) {
      variantMap.set(signature, {
        id: signature,
        routeId,
        directionId: trip.directionId,
        stopIds,
        tripIds: [trip.id],
      });
    } else {
      const existing = variantMap.get(signature)!;
      existing.tripIds.push(trip.id);
    }
  }

  return Array.from(variantMap.values());
}

/**
 * Change 43: 解析 variantKey（`<routeId>_DIR<n>_<stopId>>...`）。
 * routeId 本身可能含底線以外的符號（例如 `123-4948`），
 * 因此以最後一個 `_DIR<n>_` 作為切點，而非從左切。
 * 格式不符時回傳 null，呼叫端自行退回顯示原字串。
 */
export interface ParsedVariantKey {
  routeId: string;
  directionId: number;
  stopIds: string[];
}

export function parseVariantKey(variantKey: string): ParsedVariantKey | null {
  if (typeof variantKey !== 'string' || variantKey.length === 0) return null;
  const match = /^(.*)_DIR(\d+)_(.*)$/.exec(variantKey);
  if (!match) return null;
  const [, routeId, dir, stops] = match;
  if (!routeId || !stops) return null;
  return {
    routeId,
    directionId: Number(dir),
    stopIds: stops.split('>').filter(Boolean),
  };
}
