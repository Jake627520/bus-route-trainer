/**
 * Change 10: Recall Session API Client Types & DTOs
 * Authoritative types aligned with Change 09 REST API contracts.
 */

// Authoritative domain enums from Change 07 & 08
export type RecallMode = 'NEXT_STOP_FORWARD' | 'STOP_NAME_RECOGNITION';
export type RecallOutcome = 'PASS' | 'FAIL';
export type SessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
export type CardState = 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED';

/**
 * Standard server response envelopes
 */
export interface ApiResponseEnvelope<T> {
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

/**
 * 1. POST /api/recall/sessions
 */
export interface StartPlannedSessionRequest {
  readonly routeId: string;
  readonly variantKey: string;
  readonly sessionSize?: number;
  readonly dueRatio?: number;
}

export interface RecallSessionDto {
  readonly id: string;
  readonly driverId: string;
  readonly routeId: string;
  readonly targetVariantKey: string;
  readonly status: SessionStatus;
  readonly plannedCardIds?: readonly string[];
  readonly totalCards?: number;
  readonly currentPromptIndex: number;
  readonly currentPromptStartedAt?: string | null;
  readonly startedAt: string;
  readonly completedAt?: string | null;
  readonly abandonedAt?: string | null;
}

export interface StartPlannedSessionResponseData {
  readonly session: RecallSessionDto | null;
  readonly isNew: boolean;
  readonly reason?: 'NO_ELIGIBLE_CARDS';
}

/**
 * 2. GET /api/recall/sessions/[id]/prompt
 */
export interface CurrentSessionPromptDto {
  readonly sessionId: string;
  readonly promptIndex: number;
  readonly totalCards: number;
  readonly cardId: string;
  readonly cardKey: string;
  readonly recallMode: RecallMode;
  readonly givenReference: string;
  readonly startedAt: string;
}

export interface GetCurrentPromptResponseData {
  readonly prompt: CurrentSessionPromptDto;
}

/**
 * 3. POST /api/recall/sessions/[id]/answer
 */
export interface SubmitSessionAnswerRequest {
  readonly promptIndex: number;
  readonly rawInput: string;
  readonly recallMode?: RecallMode;
}

/**
 * Controlled Submission Identity for safe retry and anti-idempotency conflicts
 */
export interface SubmissionIdentity {
  readonly sessionId: string;
  readonly promptIndex: number;
  readonly rawInput: string;
  readonly recallMode?: RecallMode;
}

export interface SubmitSessionAnswerResponseData {
  readonly outcome: RecallOutcome;
  readonly promptIndex: number;
  readonly isSessionCompleted: boolean;
  readonly resultingState: CardState;
  readonly resultingSrsLevel: number;
  readonly isDuplicate: boolean;
}

/**
 * 4. POST /api/recall/sessions/[id]/abandon
 */
export interface AbandonSessionResponseData {
  readonly sessionId: string;
  readonly status: 'ABANDONED';
  readonly abandonedAt: string;
  readonly currentPromptIndex: number;
  readonly totalCards: number;
}

/**
 * 5. GET /api/recall/sessions/[id]
 */
export interface RecallSessionStateDto {
  readonly id: string;
  readonly driverId: string;
  readonly routeId: string;
  readonly targetVariantKey: string;
  readonly status: SessionStatus;
  readonly currentPromptIndex: number;
  readonly totalCards: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly abandonedAt: string | null;
}

export interface GetSessionStateResponseData {
  readonly session: RecallSessionStateDto;
}
