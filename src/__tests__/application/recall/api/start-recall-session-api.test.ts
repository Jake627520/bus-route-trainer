import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/recall/sessions/route';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { CardState } from '@/domain/learning/learning-card';
import { SessionStatus } from '@/domain/recall/recall-session';

describe('Phase 2: POST /api/recall/sessions Integration Tests', () => {
  const prisma = new PrismaClient();
  const routeId = 'route-phase2';
  const variantKey = 'route-phase2:dir-0:hash-phase2';

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean tables in FK order
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
  });

  async function setupEnrolledVariant(driverId: string = DEFAULT_DRIVER_ID) {
    await prisma.gtfsRoute.create({
      data: {
        id: routeId,
        shortName: 'P2',
        longName: 'Phase 2 Route',
        routeType: 3,
      },
    });

    await prisma.gtfsStop.createMany({
      data: [
        { id: 'stop-p2-1', name: 'Stop 1', latitude: 27.0, longitude: 153.0 },
        { id: 'stop-p2-2', name: 'Stop 2', latitude: 27.1, longitude: 153.0 },
      ],
    });

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId,
        directionId: 0,
        targetVariantKey: variantKey,
      },
    });

    const cards = await Promise.all([
      prisma.learningCard.create({
        data: {
          progressId: progress.id,
          cardKey: 'STOP::stop-p2-1',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
      prisma.learningCard.create({
        data: {
          progressId: progress.id,
          cardKey: 'STOP::stop-p2-2',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
    ]);

    return { progress, cards };
  }

  it('1. returns 201 Created with session data when starting a new planned session', async () => {
    await setupEnrolledVariant();

    const req = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId,
        variantKey,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json.data).toBeDefined();
    expect(json.data.isNew).toBe(true);
    expect(json.data.session).toBeDefined();
    expect(json.data.session.driverId).toBe(DEFAULT_DRIVER_ID);
    expect(json.data.session.routeId).toBe(routeId);
    expect(json.data.session.targetVariantKey).toBe(variantKey);
    expect(json.data.session.status).toBe(SessionStatus.IN_PROGRESS);
    expect(json.data.session.plannedCardIds).toHaveLength(2);
    expect(json.data.session.currentPromptIndex).toBe(0);

    // Verify session persisted in DB
    const sessionInDb = await prisma.recallSession.findUnique({
      where: { id: json.data.session.id },
    });
    expect(sessionInDb).not.toBeNull();
    expect(sessionInDb!.driverId).toBe(DEFAULT_DRIVER_ID);
  });

  it('2. returns 200 OK with isNew: false upon re-entering an already active session', async () => {
    await setupEnrolledVariant();

    // First start: 201
    const req1 = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId, variantKey }),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(201);
    const json1 = await res1.json();
    const sessionId = json1.data.session.id;

    // Second start (re-entry): 200
    const req2 = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId, variantKey }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();

    expect(json2.data.isNew).toBe(false);
    expect(json2.data.session.id).toBe(sessionId);
    expect(json2.data.session.status).toBe(SessionStatus.IN_PROGRESS);
  });

  it('3. rejects client-supplied driverId with 400 DISALLOWED_FIELD without invoking usecase', async () => {
    const req = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId,
        variantKey,
        driverId: 'hacker-driver-override',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: 'DISALLOWED_FIELD',
        message: expect.stringContaining('driverId'),
      },
    });

    // Zero sessions created in DB
    const sessionCount = await prisma.recallSession.count();
    expect(sessionCount).toBe(0);
  });

  it('4. returns 404 DRIVER_NOT_ENROLLED when driver has not enrolled in the variant', async () => {
    // No enrollment created in DB
    const req = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId: 'non-existent-route',
        variantKey: 'non-existent-variant',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: 'DRIVER_NOT_ENROLLED',
        message: expect.stringContaining('not enrolled'),
      },
    });
  });

  it('5. returns 400 INVALID_REQUEST when routeId is missing or empty', async () => {
    const req = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId: '   ',
        variantKey,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: 'INVALID_REQUEST',
        message: expect.stringContaining('routeId'),
      },
    });
  });

  it('6. returns 400 INVALID_REQUEST when variantKey is missing or empty', async () => {
    const req = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: 'INVALID_REQUEST',
        message: expect.stringContaining('variantKey'),
      },
    });
  });

  it('7. returns 400 INVALID_REQUEST when body is not valid JSON', async () => {
    const req = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-non-json-string',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body must be valid JSON',
      },
    });
  });

  it('8. accepts optional valid sessionSize and dueRatio', async () => {
    await setupEnrolledVariant();

    const req = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId,
        variantKey,
        sessionSize: 5,
        dueRatio: 0.5,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.session).toBeDefined();
  });

  it('9. rejects negative sessionSize with 400 INVALID_REQUEST', async () => {
    const req = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId,
        variantKey,
        sessionSize: -1,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('INVALID_REQUEST');
  });

  it('10. rejects dueRatio outside [0, 1] with 400 INVALID_REQUEST', async () => {
    const req = new Request('http://localhost/api/recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId,
        variantKey,
        dueRatio: 1.5,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('INVALID_REQUEST');
  });
});
