import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/recall/sessions/[id]/answer/route';
import { createRecallUseCases } from '@/infrastructure/recall/recall-composition';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { CardState } from '@/domain/learning/learning-card';
import { RecallOutcome, SessionStatus } from '@/domain/recall/recall-session';

describe('Phase 4: POST /api/recall/sessions/[id]/answer Integration Tests', () => {
  const prisma = new PrismaClient();
  const useCases = createRecallUseCases(prisma);
  const routeId = 'route-phase4';
  const variantKey = 'route-phase4:dir-0:hash-phase4';

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
        shortName: 'P4',
        longName: 'Phase 4 Route',
        routeType: 3,
      },
    });

    await prisma.gtfsStop.createMany({
      data: [
        { id: 'stop-p4-1', name: 'Stop 100', latitude: 27.0, longitude: 153.0 },
        { id: 'stop-p4-2', name: 'Stop 200', latitude: 27.1, longitude: 153.0 },
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
          cardKey: 'STOP::stop-p4-1',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
      prisma.learningCard.create({
        data: {
          progressId: progress.id,
          cardKey: 'STOP::stop-p4-2',
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

  it('1. returns 200 OK with PASS outcome and advances session cursor', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    // Fetch prompt to initialize timer
    const prompt0 = await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });

    const stopMap: Record<string, string> = {
      'STOP::stop-p4-1': 'Stop 100',
      'STOP::stop-p4-2': 'Stop 200',
    };

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 0,
        rawInput: stopMap[prompt0.prompt.cardKey]!,
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.outcome).toBe(RecallOutcome.PASS);
    expect(json.data.promptIndex).toBe(0);
    expect(json.data.isSessionCompleted).toBe(false);
    expect(json.data.isDuplicate).toBe(false);
    expect(json.data.resultingSrsLevel).toBe(1);

    // Verify session in DB advanced to promptIndex 1
    const sessionInDb = await prisma.recallSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(sessionInDb.currentPromptIndex).toBe(1);
    expect(sessionInDb.status).toBe(SessionStatus.IN_PROGRESS);
  });

  it('2. returns 200 OK with FAIL outcome when submitted answer is incorrect', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 0,
        rawInput: 'Totally Wrong Stop Name',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.outcome).toBe(RecallOutcome.FAIL);
    expect(json.data.promptIndex).toBe(0);
    expect(json.data.resultingSrsLevel).toBe(0);
  });

  it('3. returns 200 OK and completes session on final card submission', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    // Settle Prompt 0
    await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });
    await useCases.submitSessionAnswer.execute({
      sessionId: session.id,
      promptIndex: 0,
      rawInput: 'Stop 100',
      driverId: DEFAULT_DRIVER_ID,
    });

    // Settle Prompt 1 via Route Handler
    await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 1,
        rawInput: 'Stop 200',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.isSessionCompleted).toBe(true);

    const sessionInDb = await prisma.recallSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(sessionInDb.status).toBe(SessionStatus.COMPLETED);
    expect(sessionInDb.completedAt).not.toBeNull();
  });

  it('4. provides idempotent replay returning 200 OK with isDuplicate: true for verbatim re-submission', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const prompt0 = await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });

    const stopMap: Record<string, string> = {
      'STOP::stop-p4-1': 'Stop 100',
      'STOP::stop-p4-2': 'Stop 200',
    };
    const answer = stopMap[prompt0.prompt.cardKey]!;

    // First submission
    const req1 = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 0,
        rawInput: answer,
      }),
    });
    const res1 = await POST(req1, { params: Promise.resolve({ id: session.id }) });
    expect(res1.status).toBe(200);

    // Second verbatim submission (idempotent replay)
    const req2 = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 0,
        rawInput: answer,
      }),
    });
    const res2 = await POST(req2, { params: Promise.resolve({ id: session.id }) });
    expect(res2.status).toBe(200);

    const json2 = await res2.json();
    expect(json2.data.isDuplicate).toBe(true);
    expect(json2.data.outcome).toBe(RecallOutcome.PASS);
  });

  it('5. returns 409 IDEMPOTENCY_CONFLICT when prompt was already submitted with different rawInput', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const prompt0 = await useCases.getSessionPrompt.execute({ sessionId: session.id, driverId: DEFAULT_DRIVER_ID });

    const stopMap: Record<string, string> = {
      'STOP::stop-p4-1': 'Stop 100',
      'STOP::stop-p4-2': 'Stop 200',
    };
    const answer = stopMap[prompt0.prompt.cardKey]!;

    // First submission
    const req1 = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 0,
        rawInput: answer,
      }),
    });
    await POST(req1, { params: Promise.resolve({ id: session.id }) });

    // Conflicting submission with different answer
    const req2 = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 0,
        rawInput: 'Conflicting Answer',
      }),
    });
    const res2 = await POST(req2, { params: Promise.resolve({ id: session.id }) });
    expect(res2.status).toBe(409);

    const json2 = await res2.json();
    expect(json2.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('6. returns 400 PROMPT_INDEX_MISMATCH when submitted promptIndex does not match session cursor', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    // Session is at promptIndex 0, client submits promptIndex 1
    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 1,
        rawInput: 'Stop 100',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe('PROMPT_INDEX_MISMATCH');
  });

  it('7. rejects client-supplied driverId with 400 DISALLOWED_FIELD', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 0,
        rawInput: 'Stop 100',
        driverId: 'hacker-override',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe('DISALLOWED_FIELD');
  });

  it('8. returns 403 SESSION_FORBIDDEN when driver does not own the session', async () => {
    const otherDriver = 'other-driver-p4';
    const { session } = await setupEnrolledVariantAndSession(otherDriver);

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 0,
        rawInput: 'Stop 100',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error.code).toBe('SESSION_FORBIDDEN');
  });

  it('9. returns 409 SESSION_NOT_ACTIVE when attempting to submit answer to an ABANDONED session', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    await useCases.abandonSession.execute({
      sessionId: session.id,
      driverId: DEFAULT_DRIVER_ID,
    });

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: 0,
        rawInput: 'Stop 100',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error.code).toBe('SESSION_NOT_ACTIVE');
  });

  it('10. returns 400 INVALID_REQUEST when promptIndex is missing or negative', async () => {
    const { session } = await setupEnrolledVariantAndSession();

    const req = new Request(`http://localhost/api/recall/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptIndex: -1,
        rawInput: 'Stop 100',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe('INVALID_REQUEST');
  });
});
