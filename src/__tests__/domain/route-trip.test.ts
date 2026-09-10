import { describe, it, expect } from 'vitest';
import { Route, Trip, DirectionId } from '@/domain/route/route';
import { groupTripsIntoRouteVariants } from '@/domain/route/route-variant';
import { TripStop } from '@/domain/trip/trip-stop';
import { StopSequence } from '@/domain/trip/stop-sequence';

describe('Route, Trip, and RouteVariant Domain Logic', () => {
  const route66 = new Route({
    id: 'ROUTE_66',
    shortName: '66',
    longName: 'RBWH - UQ Lakes via Cultural Centre',
    routeType: 3, // Bus
  });

  const createStop = (tripId: string, seq: number, stopId: string) =>
    new TripStop({
      tripId,
      stopSequence: seq,
      stopId,
      arrivalTime: null,
      departureTime: null,
    });

  it('preserves 1 Route to N Trips relationship with nullable headsign and shapeId', () => {
    const trip1 = new Trip({
      id: 'TRIP_01',
      routeId: route66.id,
      serviceId: 'SERV_WEEKDAY',
      directionId: DirectionId.OUTBOUND,
      tripHeadsign: 'UQ Lakes',
      shapeId: 'SHAPE_01',
    });

    const trip2 = new Trip({
      id: 'TRIP_02',
      routeId: route66.id,
      serviceId: 'SERV_WEEKDAY',
      directionId: DirectionId.INBOUND,
      tripHeadsign: null, // Nullable GTFS field
      shapeId: null,      // Nullable GTFS field
    });

    expect(trip1.routeId).toBe(route66.id);
    expect(trip2.routeId).toBe(route66.id);
    expect(trip1.directionId).toBe(0);
    expect(trip2.directionId).toBe(1);
    expect(trip2.tripHeadsign).toBeNull();
    expect(trip2.shapeId).toBeNull();
  });

  it('deterministically groups trips into RouteVariants based on direction and ordered stop sequence', () => {
    // Trip 1 & Trip 2 share identical Outbound sequence: STOP_A -> STOP_B -> STOP_C
    const seq1 = new StopSequence('T1', [createStop('T1', 1, 'STOP_A'), createStop('T1', 2, 'STOP_B'), createStop('T1', 3, 'STOP_C')]);
    const seq2 = new StopSequence('T2', [createStop('T2', 1, 'STOP_A'), createStop('T2', 2, 'STOP_B'), createStop('T2', 3, 'STOP_C')]);

    // Trip 3 has branch variant Outbound: STOP_A -> STOP_B -> STOP_D
    const seq3 = new StopSequence('T3', [createStop('T3', 1, 'STOP_A'), createStop('T3', 2, 'STOP_B'), createStop('T3', 3, 'STOP_D')]);

    // Trip 4 has same stops as T1 but Inbound direction (Direction 1)
    const seq4 = new StopSequence('T4', [createStop('T4', 1, 'STOP_A'), createStop('T4', 2, 'STOP_B'), createStop('T4', 3, 'STOP_C')]);

    const tripsWithSequences = [
      {
        trip: new Trip({ id: 'T1', routeId: 'ROUTE_66', serviceId: 'S1', directionId: DirectionId.OUTBOUND }),
        sequence: seq1,
      },
      {
        trip: new Trip({ id: 'T2', routeId: 'ROUTE_66', serviceId: 'S1', directionId: DirectionId.OUTBOUND }),
        sequence: seq2,
      },
      {
        trip: new Trip({ id: 'T3', routeId: 'ROUTE_66', serviceId: 'S1', directionId: DirectionId.OUTBOUND }),
        sequence: seq3,
      },
      {
        trip: new Trip({ id: 'T4', routeId: 'ROUTE_66', serviceId: 'S1', directionId: DirectionId.INBOUND }),
        sequence: seq4,
      },
    ];

    const variants = groupTripsIntoRouteVariants('ROUTE_66', tripsWithSequences);

    // Should yield 3 distinct variants:
    // Variant 1: Outbound (A->B->C) containing T1, T2
    // Variant 2: Outbound (A->B->D) containing T3
    // Variant 3: Inbound (A->B->C) containing T4 (direction differentiates variant)
    expect(variants.length).toBe(3);

    const mainOutbound = variants.find((v) => v.directionId === DirectionId.OUTBOUND && v.stopIds.join(',') === 'STOP_A,STOP_B,STOP_C');
    expect(mainOutbound).toBeDefined();
    expect(mainOutbound?.tripIds).toEqual(['T1', 'T2']);

    const branchOutbound = variants.find((v) => v.directionId === DirectionId.OUTBOUND && v.stopIds.join(',') === 'STOP_A,STOP_B,STOP_D');
    expect(branchOutbound).toBeDefined();
    expect(branchOutbound?.tripIds).toEqual(['T3']);

    const mainInbound = variants.find((v) => v.directionId === DirectionId.INBOUND && v.stopIds.join(',') === 'STOP_A,STOP_B,STOP_C');
    expect(mainInbound).toBeDefined();
    expect(mainInbound?.tripIds).toEqual(['T4']);
  });
});
