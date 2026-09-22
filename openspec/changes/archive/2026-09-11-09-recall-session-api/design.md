# Design: 09-recall-session-api

## 1. Architectural Principles & Layered Boundaries

```text
HTTP Request (Client)
        │
        ▼
Next.js Route Handler (`src/app/api/recall/...`)
  1. Authoritative Driver Identity Resolution (`resolveAuthenticatedDriver`)
  2. Strict DTO Parsing & Validation (Zod / JSON Schema)
        │
        ▼ (DTO -> Command)
Application Use Cases (Change 08 Composition Root)
  • StartPlannedRecallSessionUseCase
  • GetCurrentSessionPromptUseCase
  • SubmitSessionAnswerUseCase
  • AbandonRecallSessionUseCase
  • GetRecallSessionStateUseCase
        │
        ▼
PostgreSQL Transaction & Row-Level Serialization (`FOR UPDATE`)
        │
        ▼
HTTP Response Mapping (`{ data: ... }` | `{ error: { code, message } }`)
```

### 1.1 Non-Leakage of Domain Semantics
- **The HTTP Route Handler is strictly a transport and validation gateway**.
- The Route Handler must NEVER:
  - Perform SRS calculations or evaluate answers.
  - Check or mutate session cursor positions.
  - Query Prisma models directly for state transitions.
  - Handle concurrency locks or idempotency checks in memory.
- All transactional guarantees, serialization points (`FOR UPDATE`), and Attempt Precedence rules established in Change 08 remain encapsulated in the Application and Infrastructure layers.

### 1.2 P0 Security Invariant: Authoritative Driver Identity & Production 401 Rejection
- Application Use Cases require `driverId` to enforce row-level ownership and prevent cross-driver data access.
- **Client request bodies and URL queries MUST NOT specify `driverId`**; any occurrence is rejected with HTTP 400 (`DISALLOWED_FIELD`).
- The Route Handler obtains `driverId` exclusively through an authoritative server-side helper (`resolveAuthenticatedDriver`):
  - **Test & Development Environment (`NODE_ENV === 'test'` / `'development'`)**: Supports `x-authenticated-driver-id` for multi-driver tenant isolation tests, defaulting to `DEFAULT_DRIVER_ID` if omitted.
  - **Trusted Gateway Mode (`TRUST_UPSTREAM_DRIVER_HEADER === 'true'`)**: Accepts verified upstream driver identity injected by reverse proxy / API Gateway.
  - **Production Environment without Trusted Identity**: Strictly rejects requests with `401 UNAUTHENTICATED`. **NEVER falls back to default driver in production**, preventing authentication bypass and data misplacement.
  - **Zero-Mutation Invariant**: Unauthenticated (401) requests are strictly prohibited from creating, reading, answering, or modifying any Recall Session in the database.

---

## 2. Standardized Response Envelope & Error Mapping

### 2.1 Success Response Envelope
All successful responses return a JSON object wrapping the payload in a `data` key:
```json
{
  "data": { ... }
}
```

### 2.2 Error Response Envelope
All error responses return a standardized JSON error object with machine-readable `code` and human-readable `message`:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Descriptive message"
  }
}
```

### 2.3 Domain to HTTP Status Mapping Matrix

| Domain / Application Error | HTTP Status | Error Code | Description |
|---|---|---|---|
| `UnauthenticatedError` | 401 Unauthorized | `UNAUTHENTICATED` | Missing or untrusted driver identity in production |
| `SessionNotFoundError` | 404 Not Found | `SESSION_NOT_FOUND` | Session ID does not exist |
| `DriverNotEnrolledError` | 404 Not Found | `DRIVER_NOT_ENROLLED` | Driver is not enrolled in the requested variant |
| `SessionOwnershipError` | 403 Forbidden | `SESSION_FORBIDDEN` | Authenticated driver does not own this session |
| `IdempotencyConflictError` | 409 Conflict | `IDEMPOTENCY_CONFLICT` | Submitted answer conflicts with an already recorded attempt |
| `CannotAbandonCompletedSessionError` | 409 Conflict | `CANNOT_ABANDON_COMPLETED_SESSION` | Completed sessions cannot be abandoned |
| `SessionNotActiveError` | 409 Conflict | `SESSION_NOT_ACTIVE` | Session is not in IN_PROGRESS status |
| `PromptIndexMismatchError` | 400 Bad Request | `PROMPT_INDEX_MISMATCH` | Submitted promptIndex does not match session cursor |
| Request body parsing / validation error | 400 Bad Request | `INVALID_REQUEST` | Malformed JSON or invalid DTO schema |
| Disallowed `driverId` in request payload | 400 Bad Request | `DISALLOWED_FIELD` | Attempt to supply driver identity from client |
| Unexpected unhandled exceptions | 500 Internal Error | `INTERNAL_SERVER_ERROR` | Server-side runtime failure |

---

## 3. Route Specifications

### 3.1 Start / Re-enter Recall Session
- **Endpoint**: `POST /api/recall/sessions`
- **Request Body**:
  ```json
  {
    "routeId": "string",
    "variantKey": "string"
  }
  ```
- **Validation**: `routeId` and `variantKey` are non-empty strings. `driverId` is forbidden.
- **Success Response**:
  - New Session Created: **HTTP 201 Created**
    ```json
    {
      "data": {
        "session": {
          "id": "uuid",
          "driverId": "driver_default_local",
          "routeId": "string",
          "targetVariantKey": "string",
          "status": "IN_PROGRESS",
          "plannedCardIds": ["c1", "c2"],
          "currentPromptIndex": 0,
          "startedAt": "2026-09-11T00:00:00.000Z"
        },
        "isNew": true
      }
    }
    ```
  - Re-entering Active Session: **HTTP 200 OK** (`isNew: false`)
  - No Eligible Cards: **HTTP 200 OK**
    ```json
    {
      "data": {
        "session": null,
        "isNew": false,
        "reason": "NO_ELIGIBLE_CARDS"
      }
    }
    ```

### 3.2 Get Current Session Prompt
- **Endpoint**: `GET /api/recall/sessions/[id]/prompt`
- **Parameters**: `id: string` (Session ID from URL path)
- **Success Response**: **HTTP 200 OK**
  ```json
  {
    "data": {
      "prompt": {
        "sessionId": "uuid",
        "promptIndex": 0,
        "totalCards": 5,
        "cardId": "uuid",
        "cardKey": "STOP::123",
        "recallMode": "STOP_NAME_RECOGNITION",
        "givenReference": "Stop #1",
        "startedAt": "2026-09-11T00:00:00.000Z"
      }
    }
  }
  ```
- **Security**: Expected answer is NOT included in prompt DTO.

### 3.3 Submit Answer
- **Endpoint**: `POST /api/recall/sessions/[id]/answer`
- **Parameters**: `id: string`
- **Request Body**:
  ```json
  {
    "promptIndex": 0,
    "rawInput": "Terminal Station",
    "recallMode": "STOP_NAME_RECOGNITION"
  }
  ```
- **Validation**: `promptIndex` is non-negative integer, `rawInput` is string, `recallMode` is valid enum (optional). `driverId` is forbidden.
- **Success Response**: **HTTP 200 OK**
  ```json
  {
    "data": {
      "outcome": "PASS",
      "promptIndex": 0,
      "isSessionCompleted": false,
      "resultingState": "LEARNING",
      "resultingSrsLevel": 1,
      "isDuplicate": false
    }
  }
  ```

### 3.4 Abandon Session
- **Endpoint**: `POST /api/recall/sessions/[id]/abandon`
- **Parameters**: `id: string`
- **Request Body**: `{}` (empty object, `driverId` forbidden)
- **Success Response**: **HTTP 200 OK**
  ```json
  {
    "data": {
      "sessionId": "uuid",
      "status": "ABANDONED",
      "abandonedAt": "2026-09-11T00:00:00.000Z",
      "currentPromptIndex": 2,
      "totalCards": 5
    }
  }
  ```

### 3.5 Query Session State
- **Endpoint**: `GET /api/recall/sessions/[id]`
- **Parameters**: `id: string`
- **Success Response**: **HTTP 200 OK**
  ```json
  {
    "data": {
      "session": {
        "id": "uuid",
        "driverId": "driver_default_local",
        "routeId": "string",
        "targetVariantKey": "string",
        "status": "IN_PROGRESS",
        "currentPromptIndex": 2,
        "totalCards": 5,
        "startedAt": "2026-09-11T00:00:00.000Z",
        "completedAt": null,
        "abandonedAt": null
      }
    }
  }
  ```

---

## 4. Test Strategy
- Integration tests execute Next.js Route Handlers with real `Request` and `NextResponse` objects against PostgreSQL test database.
- Concurrency tests verify that API route handlers correctly inherit Change 08 database row locks without deadlocking.
- Ownership tests verify that requests from unauthorized callers are rejected at the HTTP boundary with HTTP 403.
