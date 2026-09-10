import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/routes/[routeId]/variants/route';

describe('GET /api/routes/[routeId]/variants Route Handler', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsAgency.deleteMany();
  });

  it('returns 200 with reconstructed variants and deterministic sampleTrip stops', async () => {
    await prisma.gtfsAgency.create({
      data: { id: 'AG_1', name: 'Translink', timezone: 'Australia/Brisbane' },
    });

    await prisma.gtfsRoute.create({
      data: { id: 'R66', shortName: '66', longName: 'RBWH - UQ Lakes', routeType: 3 },
    });

    await prisma.gtfsStop.createMany({
      data: [
        { id: 'ST_01', name: 'RBWH Station', latitude: -27.4, longitude: 153.0 },
        { id: 'ST_02', name: 'UQ Lakes Station', latitude: -27.5, longitude: 153.0 },
      ],
    });

    await prisma.gtfsTrip.create({
      data: {
        id: 'T66_01',
        routeId: 'R66',
        serviceId: 'SERV_1',
        directionId: 0,
        tripHeadsign: 'UQ Lakes',
      },
    });

    await prisma.gtfsStopTime.createMany({
      data: [
        { tripId: 'T66_01', stopSequence: 1, stopId: 'ST_01', arrivalTime: '08:00:00', departureTime: '08:00:00', isTimepoint: true },
        { tripId: 'T66_01', stopSequence: 2, stopId: 'ST_02', arrivalTime: '08:30:00', departureTime: '08:30:00', isTimepoint: true },
      ],
    });

    const request = new Request('http://localhost:3000/api/routes/R66/variants');
    const response = await GET(request, { params: Promise.resolve({ routeId: 'R66' }) });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('data');
    expect(body.data).toHaveLength(1);

    const variant = body.data[0];
    expect(variant.routeId).toBe('R66');
    expect(variant.directionId).toBe(0);
    expect(variant.headsign).toBe('UQ Lakes');
    expect(variant.sampleTripId).toBe('T66_01');
    expect(variant.orderedStops).toHaveLength(2);
    expect(variant.orderedStops[0].stopName).toBe('RBWH Station');
    expect(variant.orderedStops[1].stopName).toBe('UQ Lakes Station');
  });

  it('returns 404 with standard error envelope when route does not exist', async () => {
    const request = new Request('http://localhost:3000/api/routes/NON_EXISTENT/variants');
    const response = await GET(request, { params: Promise.resolve({ routeId: 'NON_EXISTENT' }) });

    expect(response.status).toBe(404);
    const body = await response.json();

    expect(body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: "Route with id 'NON_EXISTENT' was not found",
      },
    });
  });
});
