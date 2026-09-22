import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as abandonHandler } from '@/app/api/recall/sessions/[id]/abandon/route';
import { POST as answerHandler } from '@/app/api/recall/sessions/[id]/answer/route';
import { createRecallUseCases } from '@/infrastructure/recall/recall-composition';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { CardState } from '@/domain/learning/learning-card';
import { SessionStatus } from '@/domain/recall/recall-session';

describe('Phase 5: POST /api/recall/sessions/[id]/abandon Integration Tests', () => {
  const prisma = new PrismaClient();
  const useCases = createRecallUseCases(prisma);
  const routeId = 'route-phase5';
  const variantKey = 'route-phase5:dir-0:hash-phase5';

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
        shortName: 'P5',
        longName: 'Phase 5 Route',
        routeType: 3,
      },
    });

    await prisma.gtfsStop.createMany({
      data: [
        { id: 'stop-p5-1', name: 'Stop 1', latitude: 27.0, longitude: 153.0 },
        { id: 'stop-p5-2', name: 'Stop 2', latitude: 27.1, longitude: 153.0 },
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
          cardKey: 'STOP::stop-p5-1',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
      prisma.learningCard.create({
        data: {
          progressId: progress.id,
          cardKey: 'STOP::stop-p5-2',
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

  it('1. transitions IN_PROGRESS session to ABANDONED, freezes cursor, clears timer, and returns 200 OK', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    // Settle Prompt 0 to advance cursor to 1
    const prompt0 = await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });
    const stopMap: Record<string, string> = {
      'STOP::stop-p5-1': 'Stop 1',
      'STOP::stop-p5-2': 'Stop 2',
    };
    await useCases.submitSessionAnswer.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: stopMap[prompt0.prompt.cardKey]!,
      driverId: DEFAULT_DRIVER_ID,
    });

    // Fetch Prompt 1 to start prompt timer
    await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });

    // Abandon session via Route Handler
    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/abandon`, {
      method: 'POST',
    });

    const res = await abandonHandler(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.sessionId).toBe(session.id);
    expect(json.data.status).toBe(SessionStatus.ABANDONED);
    expect(json.data.currentPromptIndex).toBe(1);
    expect(json.data.abandonedAt).toBeDefined();

    // Verify DB state
    const sessionInDb = await prisma.recallSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(sessionInDb.status).toBe(SessionStatus.ABANDONED);
    expect(sessionInDb.currentPromptIndex).toBe(1); // Frozen cursor
    expect(sessionInDb.currentPromptStartedAt).toBeNull(); // Timer cleared
    expect(sessionInDb.abandonedAt).not.toBeNull();
  });

  it('2. provides idempotent replay returning 200 OK with identical immutable abandonedAt timestamp', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    // First abandon
    const req1 = new Request(`http://localhost/api/recall/sessions/${session.id}/abandon`, {
      method: 'POST',
    });
    const res1 = await abandonHandler(req1, { params: Promise.resolve({ id: session.id }) });
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    const firstAbandonedAt = json1.data.abandonedAt;

    // Second abandon (idempotent replay)
    const req2 = new Request(`http://localhost/api/recall/sessions/${session.id}/abandon`, {
      method: 'POST',
    });
    const res2 = await abandonHandler(req2, { params: Promise.resolve({ id: session.id }) });
    expect(res2.status).toBe(200);
    const json2 = await res2.json();

    expect(json2.data.status).toBe(SessionStatus.ABANDONED);
    expect(json2.data.abandonedAt).toBe(firstAbandonedAt);
  });

  it('3. returns 409 CANNOT_ABANDON_COMPLETED_SESSION when session is already COMPLETED', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const stopMap: Record<string, string> = {
      'STOP::stop-p5-1': 'Stop 1',
      'STOP::stop-p5-2': 'Stop 2',
    };

    // Settle both prompts to complete session
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

    // Try to abandon completed session
    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/abandon`, {
      method: 'POST',
    });
    const res = await abandonHandler(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error.code).toBe('CANNOT_ABANDON_COMPLETED_SESSION');
  });

  it('4. returns 403 SESSION_FORBIDDEN when driver does not own the session', async () => {
    const foreignDriver = 'foreign-driver-p5';
    const { session } = await setupEnrolledVariantAndSession(foreignDriver);

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/abandon`, {
      method: 'POST',
    });
    const res = await abandonHandler(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error.code).toBe('SESSION_FORBIDDEN');
  });

  it('5. returns 404 SESSION_NOT_FOUND when session ID does not exist', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000999';
    const req = new Request(`http://localhost/api/recall/sessions/${nonExistentId}/abandon`, {
      method: 'POST',
    });
    const res = await abandonHandler(req, { params: Promise.resolve({ id: nonExistentId }) });
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('6. rejects client-supplied driverId in body with 400 DISALLOWED_FIELD', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/abandon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driverId: 'malicious-driver-override',
      }),
    });

    const res = await abandonHandler(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe('DISALLOWED_FIELD');
  });

  it('7. rejects client-supplied driverId in URL query with 400 DISALLOWED_FIELD', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/abandon?driverId=malicious-override`, {
      method: 'POST',
    });

    const res = await abandonHandler(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe('DISALLOWED_FIELD');
  });

  // Change 08 Concurrency / Ordering Semantics: Abandon wins -> subsequent new Submit fails with 409 SESSION_NOT_ACTIVE
  it('8. concurrency ordering: when Abandon completes, subsequent Submit fails with 409 SESSION_NOT_ACTIVE', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });

    // Abandon session
    const abandonReq = new Request(`http://localhost/api/recall/sessions/${session.id}/abandon`, {
      method: 'POST',
    });
    const abandonRes = await abandonHandler(abandonReq, { params: Promise.resolve({ id: session.id }) });
    expect(abandonRes.status).toBe(200);

    // Subsequent submit fails with 409
    const submitReq = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 0,
        rawInput: 'Stop 1',
      }),
    });
    const submitRes = await answerHandler(submitReq, { params: Promise.resolve({ id: session.id }) });
    expect(submitRes.status).toBe(409);

    const submitJson = await submitRes.json();
    expect(submitJson.error.code).toBe('SESSION_NOT_ACTIVE');
  });

  // Change 08 Concurrency / Ordering Semantics: Final Submit completes session -> subsequent Abandon fails with 409 CANNOT_ABANDON_COMPLETED_SESSION
  it('9. concurrency ordering: when final Submit completes session, subsequent Abandon fails with 409 CANNOT_ABANDON_COMPLETED_SESSION', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const stopMap: Record<string, string> = {
      'STOP::stop-p5-1': 'Stop 1',
      'STOP::stop-p5-2': 'Stop 2',
    };

    // Settle Prompt 0
    const prompt0 = await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });
    await useCases.submitSessionAnswer.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: stopMap[prompt0.prompt.cardKey]!,
      driverId: DEFAULT_DRIVER_ID,
    });

    // Final submit Prompt 1 via Route Handler
    const prompt1 = await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });
    const finalSubmitReq = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 1,
        rawInput: stopMap[prompt1.prompt.cardKey]!,
      }),
    });
    const submitRes = await answerHandler(finalSubmitReq, { params: Promise.resolve({ id: session.id }) });
    expect(submitRes.status).toBe(200);

    // Subsequent abandon fails with 409
    const abandonReq = new Request(`http://localhost/api/recall/sessions/${session.id}/abandon`, {
      method: 'POST',
    });
    const abandonRes = await abandonHandler(abandonReq, { params: Promise.resolve({ id: session.id }) });
    expect(abandonRes.status).toBe(409);

    const abandonJson = await abandonRes.json();
    expect(abandonJson.error.code).toBe('CANNOT_ABANDON_COMPLETED_SESSION');
  });
});
