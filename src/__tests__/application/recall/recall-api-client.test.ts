import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecallApiClient } from '@/application/recall/client/recall-api';
import {
  SubmissionIdentity,
  StartPlannedSessionRequest,
} from '@/application/recall/client/recall-types';
import {
  UnauthenticatedError,
  SessionForbiddenError,
  SessionNotFoundError,
  DriverNotEnrolledError,
  InvalidRequestError,
  PromptIndexMismatchError,
  SecurityProtocolError,
  IdempotencyConflictError,
  SessionNotActiveError,
  CannotAbandonCompletedSessionError,
  ServerError,
  NetworkError,
  RecallClientError,
} from '@/application/recall/client/recall-errors';

describe('Change 10 Phase 10.2: RecallApiClient Contract & Error Mapping Tests', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: RecallApiClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new RecallApiClient({ baseUrl: 'https://test.local', fetchFn: mockFetch as unknown as typeof fetch });
  });

  const createMockResponse = (status: number, body: unknown, ok?: boolean): Response => {
    return {
      status,
      ok: ok ?? (status >= 200 && status < 300),
      json: async () => body,
    } as unknown as Response;
  };

  describe('1. POST /api/recall/sessions (startPlannedSession)', () => {
    it('successfully starts a new session and returns unwrapped data', async () => {
      const mockResult = {
        session: {
          id: 'sess-123',
          driverId: 'drv-01',
          routeId: 'route-66',
          targetVariantKey: 'var-1',
          status: 'IN_PROGRESS',
          currentPromptIndex: 0,
          totalCards: 5,
          startedAt: '2026-09-11T09:00:00.000Z',
        },
        isNew: true,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(201, { data: mockResult }));

      const request: StartPlannedSessionRequest = {
        routeId: 'route-66',
        variantKey: 'var-1',
        sessionSize: 5,
        dueRatio: 0.5,
      };

      const result = await client.startPlannedSession(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.local/api/recall/sessions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(request),
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it('returns empty session with reason NO_ELIGIBLE_CARDS when cards are exhausted', async () => {
      const mockResult = {
        session: null,
        isNew: false,
        reason: 'NO_ELIGIBLE_CARDS',
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(200, { data: mockResult }));

      const result = await client.startPlannedSession({
        routeId: 'route-66',
        variantKey: 'var-1',
      });

      expect(result.session).toBeNull();
      expect(result.reason).toBe('NO_ELIGIBLE_CARDS');
    });

    it('P0 Security: throws SecurityProtocolError if driverId is supplied in request', async () => {
      const illegalRequest = {
        routeId: 'route-66',
        variantKey: 'var-1',
        driverId: 'malicious-driver',
      } as unknown as StartPlannedSessionRequest;

      await expect(client.startPlannedSession(illegalRequest)).rejects.toThrow(
        SecurityProtocolError,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('maps 404 DRIVER_NOT_ENROLLED to DriverNotEnrolledError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, {
          error: { code: 'DRIVER_NOT_ENROLLED', message: 'Driver not enrolled' },
        }),
      );

      await expect(
        client.startPlannedSession({ routeId: 'route-66', variantKey: 'var-1' }),
      ).rejects.toThrow(DriverNotEnrolledError);
    });
  });

  describe('2. GET /api/recall/sessions/[id]/prompt (getCurrentPrompt)', () => {
    it('successfully retrieves current prompt unwrapping data.prompt', async () => {
      const mockPrompt = {
        sessionId: 'sess-123',
        promptIndex: 0,
        totalCards: 10,
        cardId: 'card-1',
        cardKey: 'key-1',
        recallMode: 'NEXT_STOP_FORWARD' as const,
        givenReference: 'Roma Street',
        startedAt: '2026-09-11T09:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { data: { prompt: mockPrompt } }),
      );

      const prompt = await client.getCurrentPrompt('sess-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.local/api/recall/sessions/sess-123/prompt',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(prompt).toEqual(mockPrompt);
      expect((prompt as unknown as Record<string, unknown>).expectedAnswer).toBeUndefined();
    });

    it('maps 409 SESSION_NOT_ACTIVE to SessionNotActiveError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(409, {
          error: { code: 'SESSION_NOT_ACTIVE', message: 'Session is completed' },
        }),
      );

      await expect(client.getCurrentPrompt('sess-123')).rejects.toThrow(
        SessionNotActiveError,
      );
    });
  });

  describe('3. POST /api/recall/sessions/[id]/answer (submitAnswer)', () => {
    const validSubmission: SubmissionIdentity = {
      sessionId: 'sess-123',
      promptIndex: 2,
      rawInput: 'Cultural Centre',
      recallMode: 'NEXT_STOP_FORWARD',
    };

    it('successfully submits answer and returns evaluation payload', async () => {
      const mockOutcome = {
        outcome: 'PASS' as const,
        promptIndex: 2,
        isSessionCompleted: false,
        resultingState: 'REVIEW' as const,
        resultingSrsLevel: 2,
        isDuplicate: false,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(200, { data: mockOutcome }));

      const result = await client.submitAnswer(validSubmission);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.local/api/recall/sessions/sess-123/answer',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            promptIndex: 2,
            rawInput: 'Cultural Centre',
            recallMode: 'NEXT_STOP_FORWARD',
          }),
        }),
      );
      expect(result).toEqual(mockOutcome);
    });

    it('P0 Security: throws SecurityProtocolError if driverId is embedded in submission', async () => {
      const poisonedSubmission = {
        ...validSubmission,
        driverId: 'spoofed-driver',
      } as unknown as SubmissionIdentity;

      await expect(client.submitAnswer(poisonedSubmission)).rejects.toThrow(
        SecurityProtocolError,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('maps 400 PROMPT_INDEX_MISMATCH to PromptIndexMismatchError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(400, {
          error: { code: 'PROMPT_INDEX_MISMATCH', message: 'Stale index' },
        }),
      );

      await expect(client.submitAnswer(validSubmission)).rejects.toThrow(
        PromptIndexMismatchError,
      );
    });

    it('maps 409 IDEMPOTENCY_CONFLICT to IdempotencyConflictError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(409, {
          error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Payload conflict' },
        }),
      );

      await expect(client.submitAnswer(validSubmission)).rejects.toThrow(
        IdempotencyConflictError,
      );
    });
  });

  describe('4. POST /api/recall/sessions/[id]/abandon (abandonSession)', () => {
    it('successfully abandons active session and returns status ABANDONED', async () => {
      const mockResult = {
        sessionId: 'sess-123',
        status: 'ABANDONED' as const,
        abandonedAt: '2026-09-11T09:05:00.000Z',
        currentPromptIndex: 2,
        totalCards: 10,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(200, { data: mockResult }));

      const result = await client.abandonSession('sess-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.local/api/recall/sessions/sess-123/abandon',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it('maps 409 CANNOT_ABANDON_COMPLETED_SESSION to CannotAbandonCompletedSessionError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(409, {
          error: { code: 'CANNOT_ABANDON_COMPLETED_SESSION', message: 'Already completed' },
        }),
      );

      await expect(client.abandonSession('sess-123')).rejects.toThrow(
        CannotAbandonCompletedSessionError,
      );
    });
  });

  describe('5. GET /api/recall/sessions/[id] (getSessionState)', () => {
    it('successfully retrieves session state', async () => {
      const mockSession = {
        id: 'sess-123',
        driverId: 'drv-01',
        routeId: 'route-66',
        targetVariantKey: 'var-1',
        status: 'IN_PROGRESS' as const,
        currentPromptIndex: 3,
        totalCards: 10,
        startedAt: '2026-09-11T09:00:00.000Z',
        completedAt: null,
        abandonedAt: null,
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { data: { session: mockSession } }),
      );

      const session = await client.getSessionState('sess-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.local/api/recall/sessions/sess-123',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(session).toEqual(mockSession);
    });

    it('maps 404 SESSION_NOT_FOUND to SessionNotFoundError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, {
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        }),
      );

      await expect(client.getSessionState('sess-missing')).rejects.toThrow(
        SessionNotFoundError,
      );
    });
  });

  describe('6. Comprehensive HTTP & Network Error Taxonomy', () => {
    it('maps 401 UNAUTHENTICATED to UnauthenticatedError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(401, {
          error: { code: 'UNAUTHENTICATED', message: 'Auth required' },
        }),
      );

      await expect(client.getCurrentPrompt('sess-123')).rejects.toThrow(
        UnauthenticatedError,
      );
    });

    it('maps 403 SESSION_FORBIDDEN to SessionForbiddenError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(403, {
          error: { code: 'SESSION_FORBIDDEN', message: 'Forbidden' },
        }),
      );

      await expect(client.getCurrentPrompt('sess-123')).rejects.toThrow(
        SessionForbiddenError,
      );
    });

    it('maps 400 INVALID_REQUEST to InvalidRequestError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(400, {
          error: { code: 'INVALID_REQUEST', message: 'Bad params' },
        }),
      );

      await expect(client.getCurrentPrompt('sess-123')).rejects.toThrow(
        InvalidRequestError,
      );
    });

    it('maps 500 INTERNAL_SERVER_ERROR to ServerError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(500, {
          error: { code: 'INTERNAL_SERVER_ERROR', message: 'Crash' },
        }),
      );

      await expect(client.getCurrentPrompt('sess-123')).rejects.toThrow(
        ServerError,
      );
    });

    it('maps unexpected non-JSON 500 to ServerError', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: async () => {
          throw new Error('Not JSON');
        },
      } as unknown as Response);

      await expect(client.getCurrentPrompt('sess-123')).rejects.toThrow(
        ServerError,
      );
    });

    it('maps missing data envelope on 200 OK to ServerError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { invalidEnvelope: true }),
      );

      await expect(client.getCurrentPrompt('sess-123')).rejects.toThrow(
        ServerError,
      );
    });

    it('maps network drop / fetch rejection to NetworkError', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.getCurrentPrompt('sess-123')).rejects.toThrow(
        NetworkError,
      );
    });

    it('preserves status and code on RecallClientError instances', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(403, {
          error: { code: 'SESSION_FORBIDDEN', message: 'Cross driver access blocked' },
        }),
      );

      try {
        await client.getCurrentPrompt('sess-123');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(SessionForbiddenError);
        const clientErr = err as RecallClientError;
        expect(clientErr.status).toBe(403);
        expect(clientErr.code).toBe('SESSION_FORBIDDEN');
        expect(clientErr.message).toBe('Cross driver access blocked');
      }
    });
  });
});
