import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/progress/enroll/route';

describe('POST /api/progress/enroll Route Handler Integration Tests', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendarDate.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();

    // Set up GTFS fixtures in DB for R66
    await prisma.gtfsAgency.create({
      data: { id: 'translink', name: 'Translink', timezone: 'Australia/Brisbane' },
    });
    await prisma.gtfsRoute.create({
      data: { id: 'R66', shortName: '66', longName: 'RBWH - UQ Lakes', routeType: 3 },
    });
    await prisma.gtfsStop.createMany({
      data: [
        { id: 'stop_rbwh', name: 'RBWH', latitude: -27.44, longitude: 153.02 },
        { id: 'stop_kg', name: 'King George Square', latitude: -27.46, longitude: 153.02 },
        { id: 'stop_uq', name: 'UQ Lakes', latitude: -27.49, longitude: 153.01 },
      ],
    });
    await prisma.gtfsCalendar.create({
      data: { serviceId: 'S1', monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true, startDate: '20260101', endDate: '20261231' },
    });
    await prisma.gtfsTrip.create({
      data: { id: 'T66_1', routeId: 'R66', serviceId: 'S1', directionId: 0, tripHeadsign: 'UQ Lakes' },
    });
    await prisma.gtfsStopTime.createMany({
      data: [
        { tripId: 'T66_1', stopSequence: 1, stopId: 'stop_rbwh', arrivalTime: '08:00:00', departureTime: '08:00:00', isTimepoint: true },
        { tripId: 'T66_1', stopSequence: 2, stopId: 'stop_kg', arrivalTime: '08:10:00', departureTime: '08:10:00', isTimepoint: false },
        { tripId: 'T66_1', stopSequence: 3, stopId: 'stop_uq', arrivalTime: '08:20:00', departureTime: '08:20:00', isTimepoint: true },
      ],
    });
  });

  afterAll(async () => {
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
  });

  it('returns 201 Created on new enrollment with standard envelope', async () => {
    const variantKey = 'R66_DIR0_stop_rbwh>stop_kg>stop_uq';
    const request = new Request('http://localhost/api/progress/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId: 'R66', variantKey }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(body.data.routeId).toBe('R66');
    expect(body.data.targetVariantKey).toBe(variantKey);
    expect(body.data.totalCards).toBe(5); // 3 STOP + 2 NEXT_STOP
  });

  it('returns 200 OK on idempotent repeated enrollment', async () => {
    const variantKey = 'R66_DIR0_stop_rbwh>stop_kg>stop_uq';

    const req1 = new Request('http://localhost/api/progress/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId: 'R66', variantKey }),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(201);

    const req2 = new Request('http://localhost/api/progress/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId: 'R66', variantKey }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);

    const body = await res2.json();
    expect(body.data.targetVariantKey).toBe(variantKey);
  });

  it('returns 400 Bad Request when routeId or variantKey is missing', async () => {
    const request = new Request('http://localhost/api/progress/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId: 'R66' }), // missing variantKey
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 404 Not Found (VARIANT_NOT_FOUND) when variant does not exist in GTFS', async () => {
    const request = new Request('http://localhost/api/progress/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId: 'R66', variantKey: 'R66_DIR0_nonexistent' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error.code).toBe('VARIANT_NOT_FOUND');
  });
});
