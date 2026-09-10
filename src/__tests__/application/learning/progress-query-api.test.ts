import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/progress/[variantKey]/route';
import { POST } from '@/app/api/progress/enroll/route';

describe('GET /api/progress/[variantKey] Route Handler Integration Tests', () => {
  const prisma = new PrismaClient();
  const sampleVariantKey = 'R66_DIR0_stop_rbwh>stop_kg>stop_uq';

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

  it('returns 200 OK with progress and cards with projected sequence numbers for enrolled variant', async () => {
    // First enroll
    const enrollReq = new Request('http://localhost/api/progress/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId: 'R66', variantKey: sampleVariantKey }),
    });
    await POST(enrollReq);

    // Now query via GET
    const getReq = new Request(`http://localhost/api/progress/${encodeURIComponent(sampleVariantKey)}`);
    const response = await GET(getReq, {
      params: Promise.resolve({ variantKey: sampleVariantKey }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(body.data.targetVariantKey).toBe(sampleVariantKey);
    expect(body.data.cards).toHaveLength(5);

    // Verify sequences
    const stopRbwh = body.data.cards.find((c: { cardKey: string }) => c.cardKey === 'STOP::stop_rbwh');
    const nextRbwhKg = body.data.cards.find(
      (c: { cardKey: string }) => c.cardKey === 'NEXT_STOP::stop_rbwh->stop_kg'
    );
    expect(stopRbwh.currentSequence).toBe(1);
    expect(nextRbwhKg.currentSequence).toBe(1); // sequence of departure station
  });

  it('Test C: URL encoding round-trip: operates on framework-provided decoded parameter without double decoding', async () => {
    // Enroll
    const enrollReq = new Request('http://localhost/api/progress/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId: 'R66', variantKey: sampleVariantKey }),
    });
    await POST(enrollReq);

    // Next.js App Router decodes encoded path parameter (%3E -> >) into params
    const getReq = new Request(`http://localhost/api/progress/${encodeURIComponent(sampleVariantKey)}`);
    const response = await GET(getReq, {
      params: Promise.resolve({ variantKey: sampleVariantKey }), // Framework provides decoded parameter
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.targetVariantKey).toBe(sampleVariantKey);
  });

  it('returns 404 Not Found (PROGRESS_NOT_FOUND) when driver has not enrolled in the variant', async () => {
    const unenrolledKey = 'R66_DIR0_stop_rbwh>stop_kg';
    const getReq = new Request(`http://localhost/api/progress/${encodeURIComponent(unenrolledKey)}`);
    const response = await GET(getReq, {
      params: Promise.resolve({ variantKey: unenrolledKey }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error.code).toBe('PROGRESS_NOT_FOUND');
  });
});
