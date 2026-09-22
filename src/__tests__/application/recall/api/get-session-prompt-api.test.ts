import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/recall/sessions/[id]/prompt/route';
import { createRecallUseCases } from '@/infrastructure/recall/recall-composition';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { CardState, CardType } from '@/domain/learning/learning-card';
import { SessionStatus } from '@/domain/recall/recall-session';

describe('Phase 3: GET /api/recall/sessions/[id]/prompt Integration Tests', () => {
  const prisma = new PrismaClient();
  const useCases = createRecallUseCases(prisma);
  const routeId = 'route-phase3';
  const variantKey = 'route-phase3:dir-0:hash-phase3';

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

  async function setupEnrolledVariantAndSession(driverId: string = DEFAULT_DRIVER_ID) {
    await prisma.gtfsRoute.create({
      data: {
        id: routeId,
        shortName: 'P3',
        longName: 'Phase 3 Route',
        routeType: 3,
      },
    });

    await prisma.gtfsStop.createMany({
      data: [
        { id: 'stop-p3-1', name: 'Stop Alpha', latitude: 27.0, longitude: 153.0 },
        { id: 'stop-p3-2', name: 'Stop Beta', latitude: 27.1, longitude: 153.0 },
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
          cardKey: 'STOP::stop-p3-1',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
      prisma.learningCard.create({
        data: {
          progressId: progress.id,
          cardKey: 'STOP::stop-p3-2',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
    ]);

    const startResult = await useCases.startPlannedSession.execute({
      driverId,
      routeId,
      variantKey,
    });

    return { progress, cards, session: startResult.session! };
  }

  it('1. returns 200 OK with prompt data and initializes timer on first prompt fetch', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/prompt`);
    const res = await GET(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.prompt).toBeDefined();
    expect(json.data.prompt.sessionId).toBe(session.id);
    expect(json.data.prompt.promptIndex).toBe(0);
    expect(json.data.prompt.totalCards).toBe(2);
    expect(json.data.prompt.startedAt).toBeDefined();

    // Verify DB timer initialized
    const sessionInDb = await prisma.recallSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(sessionInDb.currentPromptStartedAt).not.toBeNull();
  });

  it('2. P0 Response Safety: strictly ensures expectedAnswer is NEVER in response payload', async () => {
    // Setup a NEXT_STOP card where givenReference is 'Stop Alpha' (stop1) and expectedAnswer is 'stop-p3-2' (stop2)
    const safetyVariantKey = 'route-phase3:dir-0:hash-phase3-safety';
    await prisma.gtfsRoute.create({
      data: {
        id: 'route-phase3-safety',
        shortName: 'P3S',
        longName: 'Phase 3 Safety Route',
        routeType: 3,
      },
    });
    await prisma.gtfsStop.createMany({
      data: [
        { id: 'stop-p3s-1', name: 'Stop Alpha', latitude: 27.0, longitude: 153.0 },
        { id: 'stop-p3s-2', name: 'Stop Beta', latitude: 27.1, longitude: 153.0 },
      ],
    });
    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId: DEFAULT_DRIVER_ID,
        routeId: 'route-phase3-safety',
        directionId: 0,
        targetVariantKey: safetyVariantKey,
      },
    });

    const nextStopCard = await prisma.learningCard.create({
      data: {
        progressId: progress.id,
        cardKey: 'NEXT_STOP::stop-p3s-1->stop-p3s-2',
        cardType: CardType.NEXT_STOP,
        state: CardState.NEW,
        srsLevel: 0,
      },
    });

    const session = await prisma.recallSession.create({
      data: {
        driverId: DEFAULT_DRIVER_ID,
        routeId: 'route-phase3-safety',
        targetVariantKey: safetyVariantKey,
        status: SessionStatus.IN_PROGRESS,
        plannedCardIds: [nextStopCard.id],
        currentPromptIndex: 0,
      },
    });

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/prompt`);
    const res = await GET(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    const prompt = json.data.prompt;

    expect(prompt).not.toHaveProperty('expectedAnswer');
    expect(prompt).not.toHaveProperty('answer');
    expect(prompt).not.toHaveProperty('target');

    // The expected answer is 'stop-p3-2', verify it is NEVER serialized in response JSON
    const rawSerialized = JSON.stringify(json);
    expect(rawSerialized).not.toContain('stop-p3-2');
  });

  it('3. rejects client-supplied driverId in search params with 400 DISALLOWED_FIELD', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const req = new Request(
      `http://localhost/api/recall/sessions/${session.id}/prompt?driverId=malicious-override`,
    );
    const res = await GET(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: 'DISALLOWED_FIELD',
        message: expect.stringContaining('driverId'),
      },
    });
  });

  it('4. returns 404 SESSION_NOT_FOUND when session ID does not exist', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000999';
    const req = new Request(`http://localhost/api/recall/sessions/${nonExistentId}/prompt`);
    const res = await GET(req, { params: Promise.resolve({ id: nonExistentId }) });
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: 'SESSION_NOT_FOUND',
        message: `Recall session '${nonExistentId}' was not found`,
      },
    });
  });

  it('5. returns 403 SESSION_FORBIDDEN when authenticated driver does not own the session', async () => {
    // Session created by driver 'other-driver-p3'
    const otherDriver = 'other-driver-p3';
    const { session } = await setupEnrolledVariantAndSession(otherDriver);

    // Incoming request uses DEFAULT_DRIVER_ID (not other-driver-p3)
    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/prompt`);
    const res = await GET(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: 'SESSION_FORBIDDEN',
        message: `Driver '${DEFAULT_DRIVER_ID}' is not the owner of session '${session.id}'`,
      },
    });
  });

  it('6. returns 409 SESSION_NOT_ACTIVE when session is ABANDONED', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    // Driver abandons session
    await useCases.abandonSession.execute({
      sessionId: session.id,
      driverId: DEFAULT_DRIVER_ID,
    });

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/prompt`);
    const res = await GET(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: 'SESSION_NOT_ACTIVE',
        message: `Recall session '${session.id}' is not active (status: ${SessionStatus.ABANDONED})`,
      },
    });
  });

  it('7. returns 409 SESSION_NOT_ACTIVE when session is COMPLETED', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    // Settle both cards to reach COMPLETED
    await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });
    await useCases.submitSessionAnswer.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: 'Stop Alpha',
      driverId: DEFAULT_DRIVER_ID,
    });

    await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });
    await useCases.submitSessionAnswer.execute({
      sessionId: session.id,
      promptIndex: 1,
      rawInput: 'Stop Beta',
      driverId: DEFAULT_DRIVER_ID,
    });

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/prompt`);
    const res = await GET(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: 'SESSION_NOT_ACTIVE',
        message: `Recall session '${session.id}' is not active (status: ${SessionStatus.COMPLETED})`,
      },
    });
  });
});
