import { describe, it, expect, vi } from 'vitest';
import { ListRoutesUseCase } from '@/application/gtfs/list-routes-use-case';
import { GtfsReadRepository, RouteSummaryDto } from '@/application/gtfs/gtfs-read-repository.port';

describe('ListRoutesUseCase', () => {
  it('retrieves all persisted routes from read repository without calendar/active filtering', async () => {
    const mockRoutes: RouteSummaryDto[] = [
      { id: 'R1', shortName: '100', longName: 'Route 100', routeType: 3 },
      { id: 'R2', shortName: '66', longName: 'Route 66', routeType: 3 },
    ];

    const mockRepo: GtfsReadRepository = {
      findAllRoutes: vi.fn().mockResolvedValue(mockRoutes),
      findTripsWithStopTimesByRouteId: vi.fn(),
    };

    const useCase = new ListRoutesUseCase(mockRepo);
    const result = await useCase.execute();

    expect(mockRepo.findAllRoutes).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockRoutes);
  });

  it('returns empty list when no routes exist in database', async () => {
    const mockRepo: GtfsReadRepository = {
      findAllRoutes: vi.fn().mockResolvedValue([]),
      findTripsWithStopTimesByRouteId: vi.fn(),
    };

    const useCase = new ListRoutesUseCase(mockRepo);
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
