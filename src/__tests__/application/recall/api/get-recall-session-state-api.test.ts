import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as sessionStateQueryHandler } from '@/app/api/recall/sessions/[id]/route';
import { createRecallUseCases } from '@/infrastructure/recall/recall-composition';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { CardState } from '@/domain/learning/learning-card';
import { SessionStatus } from '@/domain/recall/recall-session';

describe('Phase 6: GET /api/recall/sessions/[id] Integration Tests', () => {
  const prisma = new PrismaClient();
  const useCases = createRecallUseCases(prisma);
  const routeId = 'route-phase6';
  const variantKey = 'route-phase6:dir-0:hash-phase6';

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
        shortName: 'P6',
        longName: 'Phase 6 Route',
        routeType: 3,
      },
    });

    await prisma.gtfsStop.createMany({
      data: [
        { id: 'stop-p6-1', name: 'Phase 6 Stop 1', latitude: 28.0, longitude: 153.0 },
        { id: 'stop-p6-2', name: 'Phase 6 Stop 2', latitude: 28.1, longitude: 153.0 },
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
          cardKey: 'STOP::stop-p6-1',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
      prisma.learningCard.create({
        data: {
          progressId: progress.id,
          cardKey: 'STOP::stop-p6-2',
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

  it('1. returns 200 OK with sanitized session state DTO for active IN_PROGRESS session', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}`, {
      method: 'GET',
    });
    const res = await sessionStateQueryHandler(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.session).toBeDefined();

    const state = json.data.session;
    expect(state.id).toBe(session.id);
    expect(state.driverId).toBe(DEFAULT_DRIVER_ID);
    expect(state.routeId).toBe(routeId);
    expect(state.targetVariantKey).toBe(variantKey);
    expect(state.status).toBe(SessionStatus.IN_PROGRESS);
    expect(state.currentPromptIndex).toBe(0);
    expect(state.totalCards).toBe(2);
    expect(state.startedAt).toBeDefined();
    expect(state.completedAt).toBeNull();
    expect(state.abandonedAt).toBeNull();
  });

  it('2. returns 200 OK with status COMPLETED and valid completedAt for finished session', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const stopMap: Record<string, string> = {
      'STOP::stop-p6-1': 'Phase 6 Stop 1',
      'STOP::stop-p6-2': 'Phase 6 Stop 2',
    };

    // Settle both prompts to complete the session
    const prompt0 = await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });
    await useCases.submitSessionAnswer.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: stopMap[prompt0.prompt.cardKey]!,
      driverId: DEFAULT_DRIVER_ID,
    });

    const prompt1 = await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });
    await useCases.submitSessionAnswer.execute({
      sessionId: session.id,
      promptIndex: 1,
      rawInput: stopMap[prompt1.prompt.cardKey]!,
      driverId: DEFAULT_DRIVER_ID,
    });

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}`, {
      method: 'GET',
    });
    const res = await sessionStateQueryHandler(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    const state = json.data.session;
    expect(state.status).toBe(SessionStatus.COMPLETED);
    expect(state.completedAt).not.toBeNull();
    expect(state.abandonedAt).toBeNull();
    expect(state.currentPromptIndex).toBe(2);
  });

  it('3. returns 200 OK with status ABANDONED and valid abandonedAt for abandoned session', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    await useCases.abandonSession.execute({
      sessionId: session.id,
      driverId: DEFAULT_DRIVER_ID,
    });

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}`, {
      method: 'GET',
    });
    const res = await sessionStateQueryHandler(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    const state = json.data.session;
    expect(state.status).toBe(SessionStatus.ABANDONED);
    expect(state.abandonedAt).not.toBeNull();
    expect(state.completedAt).toBeNull();
  });

  it('4. returns 403 SESSION_FORBIDDEN when querying another driver’s session', async () => {
    const foreignDriver = 'foreign-driver-p6';
    const { session } = await setupEnrolledVariantAndSession(foreignDriver);

    // Request comes with default driver identity
    const req = new Request(`http://localhost/api/recall/sessions/${session.id}`, {
      method: 'GET',
    });
    const res = await sessionStateQueryHandler(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error.code).toBe('SESSION_FORBIDDEN');
  });

  it('5. returns 404 SESSION_NOT_FOUND when session ID does not exist', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000999';
    const req = new Request(`http://localhost/api/recall/sessions/${nonExistentId}`, {
      method: 'GET',
    });
    const res = await sessionStateQueryHandler(req, { params: Promise.resolve({ id: nonExistentId }) });
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('6. rejects client-supplied driverId in URL query with 400 DISALLOWED_FIELD', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}?driverId=malicious-override`, {
      method: 'GET',
    });
    const res = await sessionStateQueryHandler(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe('DISALLOWED_FIELD');
  });

  it('7. rejects empty or whitespace-only sessionId with 400 INVALID_REQUEST', async () => {
    const req = new Request(`http://localhost/api/recall/sessions/%20`, {
      method: 'GET',
    });
    const res = await sessionStateQueryHandler(req, { params: Promise.resolve({ id: '   ' }) });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe('INVALID_REQUEST');
  });

  it('8. strictly ensures no internal secrets (plannedCardIds, expectedAnswer, attempts) are leaked in response', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}`, {
      method: 'GET',
    });
    const res = await sessionStateQueryHandler(req, { params: Promise.resolve({ id: session.id }) });
    const json = await res.json();
    const state = json.data.session;

    // Defense-in-depth validation
    expect(state).not.toHaveProperty('plannedCardIds');
    expect(state).not.toHaveProperty('expectedAnswer');
    expect(state).not.toHaveProperty('currentExpectedAnswer');
    expect(state).not.toHaveProperty('currentCardKey');
    expect(state).not.toHaveProperty('attempts');
    expect(state).not.toHaveProperty('currentRecallMode');
    expect(state).not.toHaveProperty('currentPromptStartedAt');

    // Only authorized safe contract keys are present
    const allowedKeys = [
      'id',
      'driverId',
      'routeId',
      'targetVariantKey',
      'status',
      'currentPromptIndex',
      'totalCards',
      'startedAt',
      'completedAt',
      'abandonedAt',
    ];
    expect(Object.keys(state).sort()).toEqual(allowedKeys.sort());
  });

  it('9. guarantees query is strictly idempotent and does not mutate session state', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const beforeDb = await prisma.recallSession.findUniqueOrThrow({ where: { id: session.id } });

    const req1 = new Request(`http://localhost/api/recall/sessions/${session.id}`, { method: 'GET' });
    const res1 = await sessionStateQueryHandler(req1, { params: Promise.resolve({ id: session.id }) });
    const json1 = await res1.json();

    const req2 = new Request(`http://localhost/api/recall/sessions/${session.id}`, { method: 'GET' });
    const res2 = await sessionStateQueryHandler(req2, { params: Promise.resolve({ id: session.id }) });
    const json2 = await res2.json();

    expect(json1).toEqual(json2);

    // Verify DB state completely unchanged
    const afterDb = await prisma.recallSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(afterDb.status).toBe(beforeDb.status);
    expect(afterDb.currentPromptIndex).toBe(beforeDb.currentPromptIndex);
    expect(afterDb.currentPromptStartedAt).toEqual(beforeDb.currentPromptStartedAt);
    expect(afterDb.startedAt).toEqual(beforeDb.startedAt);
    expect(afterDb.completedAt).toEqual(beforeDb.completedAt);
    expect(afterDb.abandonedAt).toEqual(beforeDb.abandonedAt);
  });
});
