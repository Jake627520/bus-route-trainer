import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/routes/route';

describe('GET /api/routes Route Handler', () => {
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
  });

  it('returns 200 with standard envelope and deterministically ordered routes', async () => {
    await prisma.gtfsRoute.createMany({
      data: [
        { id: 'R_66', shortName: '66', longName: 'RBWH - UQ Lakes', routeType: 3 },
        { id: 'R_100', shortName: '100', longName: 'Forest Lake - City', routeType: 3 },
      ],
    });

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveLength(2);

    // Lexicographical order: '100' < '66'
    expect(body.data[0].shortName).toBe('100');
    expect(body.data[1].shortName).toBe('66');
  });

  it('returns 200 with empty array when no routes exist', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ data: [] });
  });
});
