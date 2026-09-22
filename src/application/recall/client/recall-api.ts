/**
 * Change 10: Recall Session API Client
 * Type-safe HTTP client wrapping Change 09 REST API endpoints.
 * Enforces zero-client-driverId invariant and typed error handling.
 */

import {
  StartPlannedSessionRequest,
  StartPlannedSessionResponseData,
  CurrentSessionPromptDto,
  GetCurrentPromptResponseData,
  SubmissionIdentity,
  SubmitSessionAnswerResponseData,
  AbandonSessionResponseData,
  RecallSessionStateDto,
  GetSessionStateResponseData,
  ApiResponseEnvelope,
} from './recall-types';
import {
  mapHttpError,
  NetworkError,
  SecurityProtocolError,
} from './recall-errors';

export interface RecallApiClientOptions {
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
}

export class RecallApiClient {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: RecallApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? '';
    this.fetch = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * P0 Security Guard: Enforce that client payloads never contain driverId
   */
  private assertNoDriverId(payload: unknown): void {
    if (payload && typeof payload === 'object' && 'driverId' in payload) {
      throw new SecurityProtocolError('Client is strictly forbidden from supplying driverId');
    }
  }

  /**
   * Safe fetch and envelope unwrapping
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let response: Response;

    try {
      response = await this.fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
    } catch (err: unknown) {
      if (err instanceof SecurityProtocolError) {
        throw err;
      }
      throw new NetworkError(err instanceof Error ? err.message : 'Network connection failed');
    }

    let body: ApiResponseEnvelope<T> | null = null;
    try {
      body = (await response.json()) as ApiResponseEnvelope<T>;
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      throw mapHttpError(response.status, body?.error);
    }

    if (!body || body.data === undefined) {
      throw mapHttpError(500, {
        code: 'INVALID_RESPONSE',
        message: 'Server returned a success status code without data envelope',
      });
    }

    return body.data;
  }

  /**
   * 1. POST /api/recall/sessions - Start or resume a planned session
   */
  async startPlannedSession(
    request: StartPlannedSessionRequest,
  ): Promise<StartPlannedSessionResponseData> {
    this.assertNoDriverId(request);

    return this.request<StartPlannedSessionResponseData>('/api/recall/sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * 2. GET /api/recall/sessions/[id]/prompt - Fetch active prompt
   */
  async getCurrentPrompt(sessionId: string): Promise<CurrentSessionPromptDto> {
    const sanitizedId = encodeURIComponent(sessionId.trim());
    const data = await this.request<GetCurrentPromptResponseData>(
      `/api/recall/sessions/${sanitizedId}/prompt`,
      { method: 'GET' },
    );
    return data.prompt;
  }

  /**
   * 3. POST /api/recall/sessions/[id]/answer - Submit answer with locked identity
   * Enforces Anti-Idempotency-Conflict by strictly requiring SubmissionIdentity
   */
  async submitAnswer(
    submission: SubmissionIdentity,
  ): Promise<SubmitSessionAnswerResponseData> {
    this.assertNoDriverId(submission);

    const sanitizedId = encodeURIComponent(submission.sessionId.trim());
    const payload = {
      promptIndex: submission.promptIndex,
      rawInput: submission.rawInput,
      ...(submission.recallMode ? { recallMode: submission.recallMode } : {}),
    };

    return this.request<SubmitSessionAnswerResponseData>(
      `/api/recall/sessions/${sanitizedId}/answer`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  }

  /**
   * 4. POST /api/recall/sessions/[id]/abandon - Abandon active session
   */
  async abandonSession(sessionId: string): Promise<AbandonSessionResponseData> {
    const sanitizedId = encodeURIComponent(sessionId.trim());
    return this.request<AbandonSessionResponseData>(
      `/api/recall/sessions/${sanitizedId}/abandon`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
  }

  /**
   * 5. GET /api/recall/sessions/[id] - Query session state
   */
  async getSessionState(sessionId: string): Promise<RecallSessionStateDto> {
    const sanitizedId = encodeURIComponent(sessionId.trim());
    const data = await this.request<GetSessionStateResponseData>(
      `/api/recall/sessions/${sanitizedId}`,
      { method: 'GET' },
    );
    return data.session;
  }
}
