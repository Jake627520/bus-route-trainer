import { describe, it, expect } from 'vitest';

/**
 * Type-safe dynamic route loader helper for RED baseline verification.
 * Enables RED verification before route modules are created without breaking Next.js production build typechecking.
 */
async function loadRouteHandler(path: string): Promise<Record<string, (...args: unknown[]) => Promise<Response>>> {
  return await import(/* @vite-ignore */ path);
}

/**
 * Phase 1 RED Baseline:
 * Verifies that route handler endpoints are wired to fail as expected
 * before their implementation is provided, while strictly locking the contract.
 *
 * Invariants tested:
 * 1. Client-supplied driverId MUST be rejected with HTTP 400 DISALLOWED_FIELD across all endpoints.
 * 2. GET prompt MUST NEVER serialize expectedAnswer.
 * 3. Standard error envelope format is enforced across all endpoints.
 */
describe('Change 09 Phase 1 RED Baseline Contract Tests', () => {
  const dummySessionId = '00000000-0000-0000-0000-000000000001';

  describe('P0 Security Invariant: Client-supplied driverId rejection', () => {
    it('rejects client driverId on POST /api/recall/sessions with 400 DISALLOWED_FIELD', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/route');
      const req = new Request('http://localhost/api/recall/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: 'R66',
          variantKey: 'R66_0',
          driverId: 'malicious-driver-override',
        }),
      });

      const res = await handlerModule.POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({
        error: {
          code: 'DISALLOWED_FIELD',
          message: expect.stringContaining('driverId'),
        },
      });
    });

    it('rejects client driverId on POST /api/recall/sessions/[id]/answer with 400 DISALLOWED_FIELD', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/[id]/answer/route');
      const req = new Request(`http://localhost/api/recall/sessions/${dummySessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptIndex: 0,
          rawInput: 'King George Square',
          driverId: 'malicious-driver-override',
        }),
      });

      const res = await handlerModule.POST(req, { params: Promise.resolve({ id: dummySessionId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({
        error: {
          code: 'DISALLOWED_FIELD',
          message: expect.stringContaining('driverId'),
        },
      });
    });

    it('rejects client driverId in URL search params on GET /api/recall/sessions/[id]/prompt with 400 DISALLOWED_FIELD', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/[id]/prompt/route');
      const req = new Request(
        `http://localhost/api/recall/sessions/${dummySessionId}/prompt?driverId=malicious-driver-override`,
        { method: 'GET' },
      );

      const res = await handlerModule.GET(req, { params: Promise.resolve({ id: dummySessionId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({
        error: {
          code: 'DISALLOWED_FIELD',
          message: expect.stringContaining('driverId'),
        },
      });
    });

    it('rejects client driverId on POST /api/recall/sessions/[id]/abandon with 400 DISALLOWED_FIELD', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/[id]/abandon/route');
      const req = new Request(`http://localhost/api/recall/sessions/${dummySessionId}/abandon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: 'malicious-driver-override',
        }),
      });

      const res = await handlerModule.POST(req, { params: Promise.resolve({ id: dummySessionId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({
        error: {
          code: 'DISALLOWED_FIELD',
          message: expect.stringContaining('driverId'),
        },
      });
    });

    it('rejects client driverId in URL query on GET /api/recall/sessions/[id] with 400 DISALLOWED_FIELD', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/[id]/route');
      const req = new Request(
        `http://localhost/api/recall/sessions/${dummySessionId}?driverId=malicious-driver-override`,
        { method: 'GET' },
      );

      const res = await handlerModule.GET(req, { params: Promise.resolve({ id: dummySessionId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({
        error: {
          code: 'DISALLOWED_FIELD',
          message: expect.stringContaining('driverId'),
        },
      });
    });
  });

  describe('P0 Response Safety Invariant: expectedAnswer is never leaked', () => {
    it('GET /api/recall/sessions/[id]/prompt response does NOT have expectedAnswer field in contract', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/[id]/prompt/route');
      const req = new Request(`http://localhost/api/recall/sessions/${dummySessionId}/prompt`, {
        method: 'GET',
      });

      const res = await handlerModule.GET(req, { params: Promise.resolve({ id: dummySessionId }) });
      const json = await res.json();
      if (json.data) {
        expect(json.data).not.toHaveProperty('expectedAnswer');
      }
    });
  });

  describe('Endpoint baseline invocation contract', () => {
    it('POST /api/recall/sessions responds to valid input', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/route');
      const req = new Request('http://localhost/api/recall/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId: 'R66', variantKey: 'R66_0' }),
      });
      const res = await handlerModule.POST(req);
      expect(res).toBeDefined();
    });

    it('GET /api/recall/sessions/[id]/prompt responds to query', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/[id]/prompt/route');
      const req = new Request(`http://localhost/api/recall/sessions/${dummySessionId}/prompt`);
      const res = await handlerModule.GET(req, { params: Promise.resolve({ id: dummySessionId }) });
      expect(res).toBeDefined();
    });

    it('POST /api/recall/sessions/[id]/answer responds to answer input', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/[id]/answer/route');
      const req = new Request(`http://localhost/api/recall/sessions/${dummySessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptIndex: 0, rawInput: 'test' }),
      });
      const res = await handlerModule.POST(req, { params: Promise.resolve({ id: dummySessionId }) });
      expect(res).toBeDefined();
    });

    it('POST /api/recall/sessions/[id]/abandon responds to abandon command', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/[id]/abandon/route');
      const req = new Request(`http://localhost/api/recall/sessions/${dummySessionId}/abandon`, {
        method: 'POST',
      });
      const res = await handlerModule.POST(req, { params: Promise.resolve({ id: dummySessionId }) });
      expect(res).toBeDefined();
    });

    it('GET /api/recall/sessions/[id] responds to session state query', async () => {
      const handlerModule = await loadRouteHandler('@/app/api/recall/sessions/[id]/route');
      const req = new Request(`http://localhost/api/recall/sessions/${dummySessionId}`);
      const res = await handlerModule.GET(req, { params: Promise.resolve({ id: dummySessionId }) });
      expect(res).toBeDefined();
    });
  });
});
