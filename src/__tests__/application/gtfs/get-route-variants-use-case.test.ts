import { describe, it, expect, vi } from 'vitest';
import {
  GetRouteVariantsUseCase,
  RouteNotFoundError,
} from '@/application/gtfs/get-route-variants-use-case';
import {
  GtfsReadRepository,
  RouteTripAggregateDto,
} from '@/application/gtfs/gtfs-read-repository.port';

describe('GetRouteVariantsUseCase Domain Reconstruction & Deterministic Selection', () => {
  it('throws RouteNotFoundError when route is not found in read repository', async () => {
    const mockRepo: GtfsReadRepository = {
      findAllRoutes: vi.fn(),
      findTripsWithStopTimesByRouteId: vi.fn().mockResolvedValue(null),
    };

    const useCase = new GetRouteVariantsUseCase(mockRepo);
    await expect(useCase.execute('UNKNOWN_ROUTE')).rejects.toThrow(RouteNotFoundError);
    expect(mockRepo.findTripsWithStopTimesByRouteId).toHaveBeenCalledWith('UNKNOWN_ROUTE');
  });

  it('reconstructs variants with deterministic sampleTripId, headsign, and orderedStops from sample trip', async () => {
    // 2 trips sharing the same stop IDs in the same direction, but different stopSequence numbers and different headsigns
    const aggregate: RouteTripAggregateDto = {
      route: { id: 'R66', shortName: '66', longName: 'RBWH - UQ', routeType: 3 },
      trips: [
        {
          tripId: 'T_B',
          serviceId: 'SERV1',
          directionId: 0,
          tripHeadsign: 'UQ Lakes Express', // Lexicographically larger
          shapeId: null,
          stopTimes: [
            { stopSequence: 1, stopId: 'ST_01', stopName: 'RBWH', arrivalTime: '08:00:00', departureTime: '08:00:00', isTimepoint: true },
            { stopSequence: 20, stopId: 'ST_02', stopName: 'Cultural Centre', arrivalTime: null, departureTime: null, isTimepoint: false },
            { stopSequence: 35, stopId: 'ST_03', stopName: 'UQ Lakes', arrivalTime: '24:15:00', departureTime: '24:15:00', isTimepoint: true },
          ],
        },
        {
          tripId: 'T_A', // Lexicographically smaller tripId -> sampleTripId!
          serviceId: 'SERV1',
          directionId: 0,
          tripHeadsign: 'UQ Lakes All Stops', // Lexicographically smaller headsign!
          shapeId: null,
          stopTimes: [
            { stopSequence: 1, stopId: 'ST_01', stopName: 'RBWH Station', arrivalTime: '09:00:00', departureTime: '09:00:00', isTimepoint: true },
            { stopSequence: 23, stopId: 'ST_02', stopName: 'Cultural Centre Station', arrivalTime: null, departureTime: null, isTimepoint: false },
            { stopSequence: 40, stopId: 'ST_03', stopName: 'UQ Lakes Station', arrivalTime: '25:10:00', departureTime: '25:10:00', isTimepoint: true },
          ],
        },
      ],
    };

    const mockRepo: GtfsReadRepository = {
      findAllRoutes: vi.fn(),
      findTripsWithStopTimesByRouteId: vi.fn().mockResolvedValue(aggregate),
    };

    const useCase = new GetRouteVariantsUseCase(mockRepo);
    const variants = await useCase.execute('R66');

    expect(variants).toHaveLength(1);
    const v = variants[0];

    expect(v.routeId).toBe('R66');
    expect(v.directionId).toBe(0);
    expect(v.tripCount).toBe(2);
    expect(v.stopCount).toBe(3);

    // 1. sampleTripId must be lexicographically smallest: T_A < T_B
    expect(v.sampleTripId).toBe('T_A');

    // 2. headsign must be lexicographically smallest non-null: 'UQ Lakes All Stops' < 'UQ Lakes Express'
    expect(v.headsign).toBe('UQ Lakes All Stops');

    // 3. orderedStops MUST be derived strictly from sampleTripId (T_A), meaning stopSequence 1, 23, 40 (NOT 1, 20, 35)
    expect(v.orderedStops).toHaveLength(3);
    expect(v.orderedStops[0].stopSequence).toBe(1);
    expect(v.orderedStops[0].stopName).toBe('RBWH Station');
    expect(v.orderedStops[1].stopSequence).toBe(23);
    expect(v.orderedStops[1].stopName).toBe('Cultural Centre Station');
    expect(v.orderedStops[2].stopSequence).toBe(40);
    expect(v.orderedStops[2].stopName).toBe('UQ Lakes Station');
  });

  it('handles null headsigns correctly, falling back to null if all trips in variant have null headsigns', async () => {
    const aggregate: RouteTripAggregateDto = {
      route: { id: 'R66', shortName: '66', longName: 'RBWH - UQ', routeType: 3 },
      trips: [
        {
          tripId: 'T_01',
          serviceId: 'SERV1',
          directionId: 1,
          tripHeadsign: null,
          shapeId: null,
          stopTimes: [
            { stopSequence: 1, stopId: 'ST_03', stopName: 'UQ Lakes', arrivalTime: '08:00:00', departureTime: '08:00:00', isTimepoint: true },
            { stopSequence: 2, stopId: 'ST_01', stopName: 'RBWH', arrivalTime: '08:30:00', departureTime: '08:30:00', isTimepoint: true },
          ],
        },
      ],
    };

    const mockRepo: GtfsReadRepository = {
      findAllRoutes: vi.fn(),
      findTripsWithStopTimesByRouteId: vi.fn().mockResolvedValue(aggregate),
    };

    const useCase = new GetRouteVariantsUseCase(mockRepo);
    const variants = await useCase.execute('R66');

    expect(variants).toHaveLength(1);
    expect(variants[0].headsign).toBeNull();
  });
});
