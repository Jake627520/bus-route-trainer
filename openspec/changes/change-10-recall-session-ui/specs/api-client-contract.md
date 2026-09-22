# Specification: Recall API Client Contract (Change 10)

## 1. Overview

The Recall API Client (`src/application/recall/client/`) provides a strongly-typed, decoupled interface between UI components and the Change 09 REST API endpoints.

```text
┌──────────────────────────────────────┐
│  React Components / View States       │
└──────────────────┬───────────────────┘
                   │ Calls client methods
┌──────────────────▼───────────────────┐
│  RecallApiClient (`recall-api.ts`)   │
│  - Wraps Fetch API                   │
│  - Enforces Controlled Submission    │
│  - Translates Errors to Typed Classes│
└──────────────────┬───────────────────┘
                   │ HTTP JSON (with envelope)
┌──────────────────▼───────────────────┐
│  Change 09 Next.js Route Handlers    │
│  `/api/recall/sessions/...`          │
└──────────────────────────────────────┘
```

---

## 2. API Endpoints & Authoritative DTOs

All successful responses follow the envelope format:
```json
{
  "data": { ... }
}
```
All failure responses follow the error envelope format:
```json
{
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### 2.1 Start Planned Session
- **Endpoint**: `POST /api/recall/sessions`
- **Request Body**:
  ```ts
  export interface StartPlannedSessionRequest {
    routeId: string;
    variantKey: string;
    sessionSize?: number; // optional, positive integer
    dueRatio?: number;    // optional, 0.0 to 1.0
  }
  ```
- **Security Rule**: `driverId` must NEVER be present in the request body.
- **Responses**:
  - `201 Created`: New session started.
  - `200 OK`: Existing active session returned.
- **Payload (`data`)**:
  ```ts
  export interface StartPlannedSessionResponseData {
    session: RecallSessionDto | null;
    isNew: boolean;
    reason?: 'NO_ELIGIBLE_CARDS';
  }
  ```
  *Note: When `reason === 'NO_ELIGIBLE_CARDS'`, `session` is `null`.*

### 2.2 Get Session State
- **Endpoint**: `GET /api/recall/sessions/[id]`
- **Request**: Path param `id: string` (UUID). Query parameters must NOT include `driverId`.
- **Response**: `200 OK`
- **Payload (`data`)**:
  ```ts
  export interface GetSessionStateResponseData {
    session: {
      id: string;
      driverId: string;
      routeId: string;
      targetVariantKey: string;
      status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
      currentPromptIndex: number;
      totalCards: number;
      startedAt: string; // ISO 8601
      completedAt: string | null;
      abandonedAt: string | null;
    };
  }
  ```

### 2.3 Get Current Prompt
- **Endpoint**: `GET /api/recall/sessions/[id]/prompt`
- **Request**: Path param `id: string` (UUID).
- **Response**:
  - `200 OK`: Returns the active prompt.
  - `409 Conflict` with code `SESSION_NOT_ACTIVE`: The session is not `IN_PROGRESS` (already completed or abandoned).
- **Payload (`data`)**:
  ```ts
  export interface GetCurrentPromptResponseData {
    prompt: {
      sessionId: string;
      promptIndex: number;
      totalCards: number;
      cardId: string;
      cardKey: string;
      recallMode: 'NEXT_STOP_FORWARD' | 'STOP_NAME_RECOGNITION';
      givenReference: string;
      startedAt: string; // ISO 8601
    };
  }
  ```
  *Note: `expectedAnswer` is strictly absent from this payload by design.*

### 2.4 Submit Session Answer
- **Endpoint**: `POST /api/recall/sessions/[id]/answer`
- **Request Body**:
  ```ts
  export interface SubmitSessionAnswerRequest {
    promptIndex: number;
    rawInput: string;
    recallMode?: 'NEXT_STOP_FORWARD' | 'STOP_NAME_RECOGNITION';
  }
  ```
- **Security Rule**: `driverId` must NEVER be present.
- **Responses**:
  - `200 OK`: Evaluation succeeded (either new attempt or idempotent replay).
- **Payload (`data`)**:
  ```ts
  export interface SubmitSessionAnswerResponseData {
    outcome: 'PASS' | 'FAIL';
    promptIndex: number;
    isSessionCompleted: boolean;
    resultingState: 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED';
    resultingSrsLevel: number;
    isDuplicate: boolean;
  }
  ```

### 2.5 Abandon Session
- **Endpoint**: `POST /api/recall/sessions/[id]/abandon`
- **Request**: Path param `id: string`. Optional JSON body.
- **Response**: `200 OK`
- **Payload (`data`)**:
  ```ts
  export interface AbandonSessionResponseData {
    sessionId: string;
    status: 'ABANDONED';
    abandonedAt: string;
    currentPromptIndex: number;
    totalCards: number;
  }
  ```

---

## 3. Controlled Submission Identity & Idempotency Rules

### 3.1 The Idempotency Hazard
Change 08/09 implements strict attempt-level idempotency:
- If a prompt has already been submitted, re-submitting with identical payload (`rawInput` and `recallMode`) returns `isDuplicate: true` without side effects.
- If re-submitted with **different** input or mode, the backend returns HTTP 409 `IDEMPOTENCY_CONFLICT`.
- If re-submitted with a stale `promptIndex`, backend returns HTTP 400 `PROMPT_INDEX_MISMATCH`.

### 3.2 Frontend Enforcement
1. **Never Blindly Auto-Retry Answers**:
   The API Client must NOT automatically retry failed POST `/answer` requests without user control.
2. **Submission Identity**:
   When an answer is sent, the client locks the submission record:
   ```ts
   export interface SubmissionIdentity {
     sessionId: string;
     promptIndex: number;
     rawInput: string;
     recallMode?: 'NEXT_STOP_FORWARD' | 'STOP_NAME_RECOGNITION';
   }
   ```
3. **Manual Retry UX**:
   If a network drop occurs during submission, the UI moves to `SUBMIT_FAILED` with the exact `SubmissionIdentity` preserved. The user is offered:
   - "Retry Submission" (re-sends exact same `SubmissionIdentity`).
   - "Check Session Status" (calls GET `/api/recall/sessions/[id]` to see if the submission actually succeeded on the server).

---

## 4. Client Error Taxonomy

The API Client will parse HTTP status codes and error JSON into typed error classes:

| HTTP Status | Error Code | Client Error Class | Recommended UI Handling |
|---|---|---|---|
| 400 | `INVALID_REQUEST` | `InvalidRequestError` | Show field validation alert |
| 400 | `DISALLOWED_FIELD` | `SecurityProtocolError` | Developer bug alert |
| 400 | `PROMPT_INDEX_MISMATCH` | `PromptIndexMismatchError` | Prompt user to reload current prompt |
| 401 | `UNAUTHENTICATED` | `UnauthenticatedError` | Redirect to login / auth screen |
| 403 | `SESSION_FORBIDDEN` | `SessionForbiddenError` | Show access denied message |
| 404 | `SESSION_NOT_FOUND` | `SessionNotFoundError` | Return to session selector |
| 404 | `DRIVER_NOT_ENROLLED` | `DriverNotEnrolledError` | Prompt driver to enroll in route |
| 409 | `IDEMPOTENCY_CONFLICT` | `IdempotencyConflictError` | Alert user to sync state with server |
| 409 | `CANNOT_ABANDON_COMPLETED_SESSION` | `CannotAbandonCompletedSessionError` | Inform user session is already complete |
| 409 | `SESSION_NOT_ACTIVE` | `SessionNotActiveError` | Transition view to completed/abandoned |
| 500 | `INTERNAL_SERVER_ERROR` | `ServerError` | Generic system error notification |
| Network | N/A | `NetworkError` | Show offline/reconnect banner with manual retry |
