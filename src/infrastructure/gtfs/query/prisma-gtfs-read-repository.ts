import { PrismaClient } from '@prisma/client';
import {
  GtfsReadRepository,
  RouteSummaryDto,
  RouteTripAggregateDto,
} from '@/application/gtfs/gtfs-read-repository.port';

export class PrismaGtfsReadRepository implements GtfsReadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async findAllRoutes(): Promise<RouteSummaryDto[]> {
    const records = await this.prisma.gtfsRoute.findMany({
      orderBy: [
        { shortName: 'asc' },
        { id: 'asc' },
      ],
    });

    return records.map((r) => ({
      id: r.id,
      shortName: r.shortName,
      longName: r.longName,
      routeType: r.routeType,
    }));
  }

  public async findTripsWithStopTimesByRouteId(
    routeId: string
  ): Promise<RouteTripAggregateDto | null> {
    const record = await this.prisma.gtfsRoute.findUnique({
      where: { id: routeId },
      include: {
        trips: {
          orderBy: [
            { directionId: 'asc' },
            { id: 'asc' },
          ],
          include: {
            stopTimes: {
              orderBy: { stopSequence: 'asc' },
              include: {
                stop: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!record) return null;

    return {
      route: {
        id: record.id,
        shortName: record.shortName,
        longName: record.longName,
        routeType: record.routeType,
      },
      trips: record.trips.map((t) => ({
        tripId: t.id,
        serviceId: t.serviceId,
        directionId: t.directionId,
        tripHeadsign: t.tripHeadsign,
        shapeId: t.shapeId,
        stopTimes: t.stopTimes.map((st) => ({
          stopSequence: st.stopSequence,
          stopId: st.stopId,
          stopName: st.stop.name,
          arrivalTime: st.arrivalTime,
          departureTime: st.departureTime,
          isTimepoint: st.isTimepoint,
        })),
      })),
    };
  }
}
