# Proposal: 09-recall-session-api

## Why
Change 08 successfully established and verified the core domain, application use cases, and transactional PostgreSQL adapters for the Recall Session lifecycle (Start, Prompt, Submit, Abandon).

To make these capabilities accessible to client interfaces while maintaining strict architectural boundaries, Change 09 introduces the Recall Session HTTP/API layer. This layer exposes RESTful Next.js Route Handlers with:
1. Strict DTO request parsing and input validation.
2. Standardized JSON response envelope and error mapping (mapping domain errors to precise HTTP status codes).
3. P0 Security Invariant: Authoritative driver authentication resolution, strictly forbidding client-specified driver IDs to prevent horizontal privilege escalation.
4. Clean boundary preservation: The HTTP layer serves strictly as a transport and validation gateway, never re-implementing SRS, session lifecycle, or concurrency rules.

## What Changes
- **Authoritative Driver Identity Resolution (P0 Security)**:
  - Implement `resolveAuthenticatedDriver(request: Request): Promise<string>`.
  - In current phase, resolves from secure server auth context (`DEFAULT_DRIVER_ID`).
  - Strict client rejection: Any `driverId` in JSON request bodies is rejected with HTTP 400 (`DISALLOWED_FIELD`), preventing caller spoofing.
- **HTTP Endpoints (`src/app/api/recall/...`)**:
  - `POST /api/recall/sessions`: Start planned session or re-enter active session.
  - `GET /api/recall/sessions/[id]/prompt`: Fetch current prompt and atomically initialize timer.
  - `POST /api/recall/sessions/[id]/answer`: Submit answer, execute atomic SRS settlement, advance cursor, or replay snapshot.
  - `POST /api/recall/sessions/[id]/abandon`: Abandon active session, freeze cursor, and clear timer.
  - `GET /api/recall/sessions/[id]`: Query session state and progress.
- **Standardized Error Mapping**:
  - `SessionNotFoundError` -> 404 `SESSION_NOT_FOUND`
  - `DriverNotEnrolledError` -> 404 `DRIVER_NOT_ENROLLED`
  - `SessionOwnershipError` -> 403 `SESSION_FORBIDDEN`
  - `IdempotencyConflictError` -> 409 `IDEMPOTENCY_CONFLICT`
  - `CannotAbandonCompletedSessionError` -> 409 `CANNOT_ABANDON_COMPLETED_SESSION`
  - `SessionNotActiveError` -> 409 `SESSION_NOT_ACTIVE`
  - `PromptIndexMismatchError` -> 400 `PROMPT_INDEX_MISMATCH`
  - DTO validation errors -> 400 `INVALID_REQUEST`
- **Zero UI Scope**:
  - Change 09 strictly limits implementation to the HTTP/API Route Handlers and transport validation. Client UI, PWA, and offline capabilities remain deferred to subsequent changes.
