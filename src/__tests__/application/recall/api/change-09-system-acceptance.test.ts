import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as startHandler } from '@/app/api/recall/sessions/route';
import { GET as promptHandler } from '@/app/api/recall/sessions/[id]/prompt/route';
import { POST as answerHandler } from '@/app/api/recall/sessions/[id]/answer/route';
import { POST as abandonHandler } from '@/app/api/recall/sessions/[id]/abandon/route';
import { GET as stateQueryHandler } from '@/app/api/recall/sessions/[id]/route';
import { CardState } from '@/domain/learning/learning-card';
import { SessionStatus } from '@/domain/recall/recall-session';

describe('Change 09 Phase 7: Full System Acceptance & Security Boundary Suite', () => {
  const prisma = new PrismaClient();
  const routeId = 'route-sysacc';
  const variantKey = 'route-sysacc:dir-0:hash-sysacc';

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

  async function setupEnrolledDriverWithCards(driverId: string) {
    // Upsert GTFS Route
    await prisma.gtfsRoute.upsert({
      where: { id: routeId },
      update: {},
      create: {
        id: routeId,
        shortName: 'SYS',
        longName: 'System Acceptance Route',
        routeType: 3,
      },
    });

    // Upsert GTFS Stops
    await prisma.gtfsStop.upsert({
      where: { id: 'stop-sys-1' },
      update: {},
      create: { id: 'stop-sys-1', name: 'Stop Alpha', latitude: 29.0, longitude: 153.0 },
    });
    await prisma.gtfsStop.upsert({
      where: { id: 'stop-sys-2' },
      update: {},
      create: { id: 'stop-sys-2', name: 'Stop Bravo', latitude: 29.1, longitude: 153.0 },
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
          cardKey: 'STOP::stop-sys-1',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
      prisma.learningCard.create({
        data: {
          progressId: progress.id,
          cardKey: 'STOP::stop-sys-2',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
    ]);

    return { progress, cards };
  }

  // =========================================================================
  // 1. Full Linear Progression Lifecycle: Start -> Prompt -> Submit -> Complete -> Query
  // =========================================================================
  describe('Lifecycle Path 1: Complete Progression', () => {
    it('executes Start -> Prompt #0 -> Submit #0 -> Prompt #1 -> Submit #1 -> COMPLETED -> State Query', async () => {
      const driverId = 'driver-linear-01';
      await setupEnrolledDriverWithCards(driverId);

      // Step 1: Start Session via HTTP POST
      const startReq = new Request('http://localhost/api/recall/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-authenticated-driver-id': driverId,
        },
        body: JSON.stringify({ routeId, variantKey }),
      });
      const startRes = await startHandler(startReq);
      expect(startRes.status).toBe(201);
      const startJson = await startRes.json();
      const sessionId = startJson.data.session.id;
      expect(startJson.data.isNew).toBe(true);
      expect(startJson.data.session.status).toBe(SessionStatus.IN_PROGRESS);

      // Step 2: Fetch Prompt 0 via HTTP GET
      const prompt0Req = new Request(`http://localhost/api/recall/sessions/${sessionId}/prompt`, {
        method: 'GET',
        headers: { 'x-authenticated-driver-id': driverId },
      });
      const prompt0Res = await promptHandler(prompt0Req, { params: Promise.resolve({ id: sessionId }) });
      expect(prompt0Res.status).toBe(200);
      const prompt0Json = await prompt0Res.json();
      expect(prompt0Json.data.prompt.promptIndex).toBe(0);
      expect(prompt0Json.data.prompt).not.toHaveProperty('expectedAnswer');

      // Step 3: Submit Answer 0 via HTTP POST
      const stopMap: Record<string, string> = {
        'STOP::stop-sys-1': 'Stop Alpha',
        'STOP::stop-sys-2': 'Stop Bravo',
      };
      const answer0Req = new Request(`http://localhost/api/recall/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-authenticated-driver-id': driverId,
        },
        body: JSON.stringify({
          promptIndex: 0,
          rawInput: stopMap[prompt0Json.data.prompt.cardKey]!,
        }),
      });
      const answer0Res = await answerHandler(answer0Req, { params: Promise.resolve({ id: sessionId }) });
      expect(answer0Res.status).toBe(200);
      const answer0Json = await answer0Res.json();
      expect(answer0Json.data.outcome).toBe('PASS');
      expect(answer0Json.data.isSessionCompleted).toBe(false);

      // Step 4: Fetch Prompt 1 via HTTP GET
      const prompt1Req = new Request(`http://localhost/api/recall/sessions/${sessionId}/prompt`, {
        method: 'GET',
        headers: { 'x-authenticated-driver-id': driverId },
      });
      const prompt1Res = await promptHandler(prompt1Req, { params: Promise.resolve({ id: sessionId }) });
      expect(prompt1Res.status).toBe(200);
      const prompt1Json = await prompt1Res.json();
      expect(prompt1Json.data.prompt.promptIndex).toBe(1);

      // Step 5: Submit Final Answer 1 via HTTP POST
      const answer1Req = new Request(`http://localhost/api/recall/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-authenticated-driver-id': driverId,
        },
        body: JSON.stringify({
          promptIndex: 1,
          rawInput: stopMap[prompt1Json.data.prompt.cardKey]!,
        }),
      });
      const answer1Res = await answerHandler(answer1Req, { params: Promise.resolve({ id: sessionId }) });
      expect(answer1Res.status).toBe(200);
      const answer1Json = await answer1Res.json();
      expect(answer1Json.data.outcome).toBe('PASS');
      expect(answer1Json.data.isSessionCompleted).toBe(true);

      // Step 6: Query Final Session State via HTTP GET
      const stateReq = new Request(`http://localhost/api/recall/sessions/${sessionId}`, {
        method: 'GET',
        headers: { 'x-authenticated-driver-id': driverId },
      });
      const stateRes = await stateQueryHandler(stateReq, { params: Promise.resolve({ id: sessionId }) });
      expect(stateRes.status).toBe(200);
      const stateJson = await stateRes.json();
      expect(stateJson.data.session.status).toBe(SessionStatus.COMPLETED);
      expect(stateJson.data.session.completedAt).not.toBeNull();
      expect(stateJson.data.session.currentPromptIndex).toBe(2);
    });
  });

  // =========================================================================
  // 2. Early Abandonment Lifecycle: Start -> Prompt -> Abandon -> Query
  // =========================================================================
  describe('Lifecycle Path 2: Early Abandonment', () => {
    it('executes Start -> Prompt #0 -> Submit #0 -> Prompt #1 -> Abandon -> ABANDONED -> State Query', async () => {
      const driverId = 'driver-abandon-01';
      await setupEnrolledDriverWithCards(driverId);

      // Start
      const startReq = new Request('http://localhost/api/recall/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-authenticated-driver-id': driverId,
        },
        body: JSON.stringify({ routeId, variantKey }),
      });
      const startRes = await startHandler(startReq);
      const sessionId = (await startRes.json()).data.session.id;

      // Fetch Prompt 0 & Answer Prompt 0
      const prompt0Req = new Request(`http://localhost/api/recall/sessions/${sessionId}/prompt`, {
        headers: { 'x-authenticated-driver-id': driverId },
      });
      const prompt0Json = await (await promptHandler(prompt0Req, { params: Promise.resolve({ id: sessionId }) })).json();

      const stopMap: Record<string, string> = {
        'STOP::stop-sys-1': 'Stop Alpha',
        'STOP::stop-sys-2': 'Stop Bravo',
      };
      await answerHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverId },
          body: JSON.stringify({ promptIndex: 0, rawInput: stopMap[prompt0Json.data.prompt.cardKey]! }),
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );

      // Fetch Prompt 1 (cursor at 1, timer running)
      await promptHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}/prompt`, {
          headers: { 'x-authenticated-driver-id': driverId },
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );

      // Abandon Session
      const abandonReq = new Request(`http://localhost/api/recall/sessions/${sessionId}/abandon`, {
        method: 'POST',
        headers: { 'x-authenticated-driver-id': driverId },
      });
      const abandonRes = await abandonHandler(abandonReq, { params: Promise.resolve({ id: sessionId }) });
      expect(abandonRes.status).toBe(200);
      const abandonJson = await abandonRes.json();
      expect(abandonJson.data.status).toBe(SessionStatus.ABANDONED);
      expect(abandonJson.data.currentPromptIndex).toBe(1);

      // State Query confirms frozen cursor & abandoned timestamp
      const stateRes = await stateQueryHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}`, {
          headers: { 'x-authenticated-driver-id': driverId },
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      const stateJson = await stateRes.json();
      expect(stateJson.data.session.status).toBe(SessionStatus.ABANDONED);
      expect(stateJson.data.session.currentPromptIndex).toBe(1);
      expect(stateJson.data.session.abandonedAt).not.toBeNull();
      expect(stateJson.data.session.completedAt).toBeNull();
    });
  });

  // =========================================================================
  // 3. Terminal State Invariant Defense Matrix
  // =========================================================================
  describe('Terminal Invariant Defense Matrix', () => {
    it('defends ABANDONED session against prompt/answer and allows idempotent abandon and query', async () => {
      const driverId = 'driver-defense-abandon';
      await setupEnrolledDriverWithCards(driverId);

      const startRes = await startHandler(
        new Request('http://localhost/api/recall/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverId },
          body: JSON.stringify({ routeId, variantKey }),
        }),
      );
      const sessionId = (await startRes.json()).data.session.id;

      // Abandon
      const firstAbandonRes = await abandonHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}/abandon`, {
          method: 'POST',
          headers: { 'x-authenticated-driver-id': driverId },
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      const firstAbandonedAt = (await firstAbandonRes.json()).data.abandonedAt;

      // Defense 1: Prompt on abandoned session -> 409 SESSION_NOT_ACTIVE
      const promptRes = await promptHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}/prompt`, {
          headers: { 'x-authenticated-driver-id': driverId },
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      expect(promptRes.status).toBe(409);
      expect((await promptRes.json()).error.code).toBe('SESSION_NOT_ACTIVE');

      // Defense 2: Answer on abandoned session -> 409 SESSION_NOT_ACTIVE
      const answerRes = await answerHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverId },
          body: JSON.stringify({ promptIndex: 0, rawInput: 'Stop Alpha' }),
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      expect(answerRes.status).toBe(409);
      expect((await answerRes.json()).error.code).toBe('SESSION_NOT_ACTIVE');

      // Defense 3: Re-abandon -> 200 idempotent replay
      const secondAbandonRes = await abandonHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}/abandon`, {
          method: 'POST',
          headers: { 'x-authenticated-driver-id': driverId },
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      expect(secondAbandonRes.status).toBe(200);
      expect((await secondAbandonRes.json()).data.abandonedAt).toBe(firstAbandonedAt);

      // Defense 4: Query -> 200 OK
      const queryRes = await stateQueryHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}`, {
          headers: { 'x-authenticated-driver-id': driverId },
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      expect(queryRes.status).toBe(200);
      expect((await queryRes.json()).data.session.status).toBe(SessionStatus.ABANDONED);
    });

    it('defends COMPLETED session against prompt/answer/abandon and allows query', async () => {
      const driverId = 'driver-defense-completed';
      await setupEnrolledDriverWithCards(driverId);

      const startRes = await startHandler(
        new Request('http://localhost/api/recall/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverId },
          body: JSON.stringify({ routeId, variantKey }),
        }),
      );
      const sessionId = (await startRes.json()).data.session.id;

      // Complete session
      for (let i = 0; i < 2; i++) {
        const pRes = await promptHandler(
          new Request(`http://localhost/api/recall/sessions/${sessionId}/prompt`, {
            headers: { 'x-authenticated-driver-id': driverId },
          }),
          { params: Promise.resolve({ id: sessionId }) },
        );
        const pJson = await pRes.json();
        const cardKey = pJson.data.prompt.cardKey;
        const answer = cardKey === 'STOP::stop-sys-1' ? 'Stop Alpha' : 'Stop Bravo';

        await answerHandler(
          new Request(`http://localhost/api/recall/sessions/${sessionId}/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverId },
            body: JSON.stringify({ promptIndex: i, rawInput: answer }),
          }),
          { params: Promise.resolve({ id: sessionId }) },
        );
      }

      // Defense 1: Prompt on completed session -> 409 SESSION_NOT_ACTIVE
      const promptRes = await promptHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}/prompt`, {
          headers: { 'x-authenticated-driver-id': driverId },
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      expect(promptRes.status).toBe(409);
      expect((await promptRes.json()).error.code).toBe('SESSION_NOT_ACTIVE');

      // Defense 2: Answer on completed session -> 409 SESSION_NOT_ACTIVE
      const answerRes = await answerHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverId },
          body: JSON.stringify({ promptIndex: 2, rawInput: 'extra' }),
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      expect(answerRes.status).toBe(409);
      expect((await answerRes.json()).error.code).toBe('SESSION_NOT_ACTIVE');

      // Defense 3: Abandon on completed session -> 409 CANNOT_ABANDON_COMPLETED_SESSION
      const abandonRes = await abandonHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}/abandon`, {
          method: 'POST',
          headers: { 'x-authenticated-driver-id': driverId },
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      expect(abandonRes.status).toBe(409);
      expect((await abandonRes.json()).error.code).toBe('CANNOT_ABANDON_COMPLETED_SESSION');

      // Defense 4: Query -> 200 OK
      const queryRes = await stateQueryHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionId}`, {
          headers: { 'x-authenticated-driver-id': driverId },
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      expect(queryRes.status).toBe(200);
      expect((await queryRes.json()).data.session.status).toBe(SessionStatus.COMPLETED);
    });
  });

  // =========================================================================
  // 4. Full Mutual Isolation Matrix (Driver A vs Driver B)
  // =========================================================================
  describe('Full Mutual Isolation Matrix (Driver A vs Driver B)', () => {
    it('enforces bidirectional strict 403 isolation across all session operations with zero leakage', async () => {
      const driverA = 'driver-matrix-A';
      const driverB = 'driver-matrix-B';
      await setupEnrolledDriverWithCards(driverA);
      await setupEnrolledDriverWithCards(driverB);

      // Start Session A for Driver A
      const startResA = await startHandler(
        new Request('http://localhost/api/recall/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverA },
          body: JSON.stringify({ routeId, variantKey }),
        }),
      );
      const sessionAId = (await startResA.json()).data.session.id;

      // Start Session B for Driver B
      const startResB = await startHandler(
        new Request('http://localhost/api/recall/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverB },
          body: JSON.stringify({ routeId, variantKey }),
        }),
      );
      const sessionBId = (await startResB.json()).data.session.id;

      // Driver A accesses own Session A -> 200 OK
      const promptA_by_A = await promptHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionAId}/prompt`, {
          headers: { 'x-authenticated-driver-id': driverA },
        }),
        { params: Promise.resolve({ id: sessionAId }) },
      );
      expect(promptA_by_A.status).toBe(200);

      // Driver A attempts to access Driver B's Session B -> 403 Forbidden
      const promptB_by_A = await promptHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionBId}/prompt`, {
          headers: { 'x-authenticated-driver-id': driverA },
        }),
        { params: Promise.resolve({ id: sessionBId }) },
      );
      expect(promptB_by_A.status).toBe(403);
      const promptB_by_A_json = await promptB_by_A.json();
      expect(promptB_by_A_json.error.code).toBe('SESSION_FORBIDDEN');
      // Zero leakage: no sessionB details or card information leaked
      expect(JSON.stringify(promptB_by_A_json)).not.toContain('stop-sys');

      // Driver A attempts to answer Driver B's Session B -> 403
      const answerB_by_A = await answerHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionBId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverA },
          body: JSON.stringify({ promptIndex: 0, rawInput: 'Stop Alpha' }),
        }),
        { params: Promise.resolve({ id: sessionBId }) },
      );
      expect(answerB_by_A.status).toBe(403);

      // Driver A attempts to abandon Driver B's Session B -> 403
      const abandonB_by_A = await abandonHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionBId}/abandon`, {
          method: 'POST',
          headers: { 'x-authenticated-driver-id': driverA },
        }),
        { params: Promise.resolve({ id: sessionBId }) },
      );
      expect(abandonB_by_A.status).toBe(403);

      // Driver A attempts to query Driver B's Session B -> 403
      const queryB_by_A = await stateQueryHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionBId}`, {
          headers: { 'x-authenticated-driver-id': driverA },
        }),
        { params: Promise.resolve({ id: sessionBId }) },
      );
      expect(queryB_by_A.status).toBe(403);

      // Inverse check: Driver B attempts to query Driver A's Session A -> 403
      const queryA_by_B = await stateQueryHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionAId}`, {
          headers: { 'x-authenticated-driver-id': driverB },
        }),
        { params: Promise.resolve({ id: sessionAId }) },
      );
      expect(queryA_by_B.status).toBe(403);

      // Driver B accesses own Session B -> 200 OK
      const queryB_by_B = await stateQueryHandler(
        new Request(`http://localhost/api/recall/sessions/${sessionBId}`, {
          headers: { 'x-authenticated-driver-id': driverB },
        }),
        { params: Promise.resolve({ id: sessionBId }) },
      );
      expect(queryB_by_B.status).toBe(200);
      expect((await queryB_by_B.json()).data.session.driverId).toBe(driverB);
    });
  });

  // =========================================================================
  // 5. Universal Security Invariants across ALL 5 Endpoints
  // =========================================================================
  describe('Universal Invariants: Client-Supplied driverId Rejection', () => {
    const dummyId = '11111111-1111-1111-1111-111111111111';

    it('rejects driverId in query across all 5 endpoints with 400 DISALLOWED_FIELD', async () => {
      // 1. POST /api/recall/sessions
      const r1 = await startHandler(
        new Request('http://localhost/api/recall/sessions?driverId=hacker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routeId: 'r', variantKey: 'v' }),
        }),
      );
      expect(r1.status).toBe(400);
      expect((await r1.json()).error.code).toBe('DISALLOWED_FIELD');

      // 2. GET /api/recall/sessions/[id]/prompt
      const r2 = await promptHandler(
        new Request(`http://localhost/api/recall/sessions/${dummyId}/prompt?driverId=hacker`),
        { params: Promise.resolve({ id: dummyId }) },
      );
      expect(r2.status).toBe(400);
      expect((await r2.json()).error.code).toBe('DISALLOWED_FIELD');

      // 3. POST /api/recall/sessions/[id]/answer
      const r3 = await answerHandler(
        new Request(`http://localhost/api/recall/sessions/${dummyId}/answer?driverId=hacker`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ promptIndex: 0, rawInput: 'test' }),
        }),
        { params: Promise.resolve({ id: dummyId }) },
      );
      expect(r3.status).toBe(400);
      expect((await r3.json()).error.code).toBe('DISALLOWED_FIELD');

      // 4. POST /api/recall/sessions/[id]/abandon
      const r4 = await abandonHandler(
        new Request(`http://localhost/api/recall/sessions/${dummyId}/abandon?driverId=hacker`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: dummyId }) },
      );
      expect(r4.status).toBe(400);
      expect((await r4.json()).error.code).toBe('DISALLOWED_FIELD');

      // 5. GET /api/recall/sessions/[id]
      const r5 = await stateQueryHandler(
        new Request(`http://localhost/api/recall/sessions/${dummyId}?driverId=hacker`),
        { params: Promise.resolve({ id: dummyId }) },
      );
      expect(r5.status).toBe(400);
      expect((await r5.json()).error.code).toBe('DISALLOWED_FIELD');
    });

    it('rejects driverId in JSON body across all 3 POST endpoints with 400 DISALLOWED_FIELD', async () => {
      // 1. POST /api/recall/sessions
      const r1 = await startHandler(
        new Request('http://localhost/api/recall/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routeId: 'r', variantKey: 'v', driverId: 'malicious' }),
        }),
      );
      expect(r1.status).toBe(400);
      expect((await r1.json()).error.code).toBe('DISALLOWED_FIELD');

      // 2. POST /api/recall/sessions/[id]/answer
      const r2 = await answerHandler(
        new Request(`http://localhost/api/recall/sessions/${dummyId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ promptIndex: 0, rawInput: 'test', driverId: 'malicious' }),
        }),
        { params: Promise.resolve({ id: dummyId }) },
      );
      expect(r2.status).toBe(400);
      expect((await r2.json()).error.code).toBe('DISALLOWED_FIELD');

      // 3. POST /api/recall/sessions/[id]/abandon
      const r3 = await abandonHandler(
        new Request(`http://localhost/api/recall/sessions/${dummyId}/abandon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driverId: 'malicious' }),
        }),
        { params: Promise.resolve({ id: dummyId }) },
      );
      expect(r3.status).toBe(400);
      expect((await r3.json()).error.code).toBe('DISALLOWED_FIELD');
    });
  });

  // =========================================================================
  // 6. Zero Leakage & Clean Architecture Contracts
  // =========================================================================
  describe('Zero-Leakage & Clean Architecture Contracts', () => {
    it('guarantees client injected fields are completely ignored and cannot mutate session metadata', async () => {
      const driverId = 'driver-integrity-01';
      await setupEnrolledDriverWithCards(driverId);

      const startRes = await startHandler(
        new Request('http://localhost/api/recall/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverId },
          // Maliciously inject extra state override fields into start payload
          body: JSON.stringify({
            routeId,
            variantKey,
            status: 'COMPLETED',
            currentPromptIndex: 99,
            srsLevel: 10,
          }),
        }),
      );
      expect(startRes.status).toBe(201);
      const startJson = await startRes.json();
      const sessionId = startJson.data.session.id;

      // Injected fields must have had zero effect
      expect(startJson.data.session.status).toBe(SessionStatus.IN_PROGRESS);
      expect(startJson.data.session.currentPromptIndex).toBe(0);

      const sessionInDb = await prisma.recallSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(sessionInDb.status).toBe(SessionStatus.IN_PROGRESS);
      expect(sessionInDb.currentPromptIndex).toBe(0);
    });
  });

  // =========================================================================
  // 7. Production Unauthenticated Enforcement & State Non-Mutation Invariant
  // =========================================================================
  describe('Production 401 UNAUTHENTICATED Enforcement & State Non-Mutation Invariant', () => {
    it('returns 401 and strictly prevents creating, reading, answering, or abandoning sessions in production without trusted identity', async () => {
      const driverId = 'driver-prod-unauth';
      await setupEnrolledDriverWithCards(driverId);

      // Pre-create an active session using test seam to verify read/modify mutations are blocked later
      const seedRes = await startHandler(
        new Request('http://localhost/api/recall/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': driverId },
          body: JSON.stringify({ routeId, variantKey }),
        }),
      );
      const existingSessionId = (await seedRes.json()).data.session.id;

      const origEnv = process.env.NODE_ENV;
      const origTrust = process.env.TRUST_UPSTREAM_DRIVER_HEADER;

      try {
        // Switch to simulated production mode without trusted gateway
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        delete process.env.TRUST_UPSTREAM_DRIVER_HEADER;

        // 1. Production + no identity attempting to start session -> 401 (no session created)
        const initialCount = await prisma.recallSession.count();
        const unauthStartReq = new Request('http://localhost/api/recall/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routeId, variantKey }),
        });
        const unauthStartRes = await startHandler(unauthStartReq);
        expect(unauthStartRes.status).toBe(401);
        const unauthStartJson = await unauthStartRes.json();
        expect(unauthStartJson.error.code).toBe('UNAUTHENTICATED');
        // Verify database: no session was created
        const afterCount = await prisma.recallSession.count();
        expect(afterCount).toBe(initialCount);

        // 2. Production + spoofed header attempting to read session -> 401
        const unauthReadReq = new Request(`http://localhost/api/recall/sessions/${existingSessionId}`, {
          headers: { 'x-authenticated-driver-id': 'spoofed-driver' },
        });
        const unauthReadRes = await stateQueryHandler(unauthReadReq, { params: Promise.resolve({ id: existingSessionId }) });
        expect(unauthReadRes.status).toBe(401);
        expect((await unauthReadRes.json()).error.code).toBe('UNAUTHENTICATED');

        // 3. Production + spoofed header attempting to answer session -> 401 (no mutation)
        const unauthAnswerReq = new Request(`http://localhost/api/recall/sessions/${existingSessionId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-authenticated-driver-id': 'spoofed-driver' },
          body: JSON.stringify({ promptIndex: 0, rawInput: 'Stop Alpha' }),
        });
        const unauthAnswerRes = await answerHandler(unauthAnswerReq, { params: Promise.resolve({ id: existingSessionId }) });
        expect(unauthAnswerRes.status).toBe(401);
        expect((await unauthAnswerRes.json()).error.code).toBe('UNAUTHENTICATED');

        // 4. Production + spoofed header attempting to abandon session -> 401 (no state change)
        const unauthAbandonReq = new Request(`http://localhost/api/recall/sessions/${existingSessionId}/abandon`, {
          method: 'POST',
          headers: { 'x-authenticated-driver-id': 'spoofed-driver' },
        });
        const unauthAbandonRes = await abandonHandler(unauthAbandonReq, { params: Promise.resolve({ id: existingSessionId }) });
        expect(unauthAbandonRes.status).toBe(401);
        expect((await unauthAbandonRes.json()).error.code).toBe('UNAUTHENTICATED');

        // Verify database integrity: existing session state, cursor, and attempts remain completely untouched
        const sessionInDb = await prisma.recallSession.findUniqueOrThrow({ where: { id: existingSessionId } });
        expect(sessionInDb.status).toBe(SessionStatus.IN_PROGRESS);
        expect(sessionInDb.currentPromptIndex).toBe(0);
        expect(sessionInDb.abandonedAt).toBeNull();
        const attemptsInDb = await prisma.recallAttempt.count({ where: { sessionId: existingSessionId } });
        expect(attemptsInDb).toBe(0);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
        if (origTrust !== undefined) {
          process.env.TRUST_UPSTREAM_DRIVER_HEADER = origTrust;
        }
      }
    });
  });
});
