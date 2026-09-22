# Tasks: 09-recall-session-api

## Phase 1: Specifications, Auth Resolver & Standard Error Mapping
- [x] 1.1 Implement authoritative driver identity resolver (`resolveAuthenticatedDriver`) with strict prohibition of client-supplied `driverId`.
- [x] 1.2 Implement centralized HTTP error mapping helper translating Domain/Application errors to HTTP status codes (400, 403, 404, 409, 500).
- [x] 1.3 Setup RED integration test suite skeleton for all 5 endpoints in `src/__tests__/application/recall/api/`.

---

## Phase 2: Start / Re-enter Recall Session Endpoint
- [x] 2.1 Implement Route Handler `POST /api/recall/sessions`:
  - DTO schema validation (`routeId`, `variantKey`).
  - Reject requests containing client-specified `driverId` (HTTP 400).
  - Resolve authenticated driver ID.
  - Invoke `StartPlannedRecallSessionUseCase`.
  - Return HTTP 201 for new sessions, HTTP 200 for re-entry or `NO_ELIGIBLE_CARDS`.
  - Handle `DriverNotEnrolledError` -> HTTP 404.
- [x] 2.2 Integration tests for `POST /api/recall/sessions`:
  - Test starting new session returns 201 with session DTO.
  - Test re-entering active session returns 200 with `isNew: false`.
  - Test not enrolled returns 404.
  - Test invalid body or illegal `driverId` returns 400.

---

## Phase 3: Get Current Session Prompt Endpoint
- [x] 3.1 Implement Route Handler `GET /api/recall/sessions/[id]/prompt`:
  - Extract session ID from route params.
  - Resolve authenticated driver ID.
  - Invoke `GetCurrentSessionPromptUseCase`.
  - Return HTTP 200 with sanitized `CurrentSessionPromptDto` (no expected answer).
  - Handle `SessionNotFoundError` -> 404, `SessionOwnershipError` -> 403, `SessionNotActiveError` -> 409.
- [x] 3.2 Integration tests for `GET /api/recall/sessions/[id]/prompt`:
  - Test successful prompt retrieval returns 200 with prompt DTO.
  - Test timer initialized on first GET.
  - Test non-owner returns 403.
  - Test completed/abandoned session returns 409.

---

## Phase 4: Submit Session Answer Endpoint
- [x] 4.1 Implement Route Handler `POST /api/recall/sessions/[id]/answer`:
  - Validate body: `promptIndex`, `rawInput`, optional `recallMode`.
  - Reject requests containing client-specified `driverId` (HTTP 400).
  - Invoke `SubmitSessionAnswerUseCase`.
  - Return HTTP 200 with `SubmitSessionAnswerResult`.
  - Map errors: `PromptIndexMismatchError` -> 400, `IdempotencyConflictError` -> 409, `SessionOwnershipError` -> 403.
- [x] 4.2 Integration tests for `POST /api/recall/sessions/[id]/answer`:
  - Test normal PASS/FAIL submission returns 200 with resulting SRS.
  - Test idempotent replay on active, completed, and abandoned sessions returns 200 with `isDuplicate: true`.
  - Test idempotency conflict returns 409.
  - Test cursor mismatch returns 400.

---

## Phase 5: Abandon Recall Session Endpoint
- [x] 5.1 Implement Route Handler `POST /api/recall/sessions/[id]/abandon`:
  - Validate body (reject client-specified `driverId`).
  - Invoke `AbandonRecallSessionUseCase`.
  - Return HTTP 200 with `AbandonRecallSessionResult`.
  - Map errors: `CannotAbandonCompletedSessionError` -> 409, `SessionOwnershipError` -> 403, `SessionNotFoundError` -> 404.
- [x] 5.2 Integration tests for `POST /api/recall/sessions/[id]/abandon`:
  - Test active session abandoned returns 200 with frozen cursor.
  - Test idempotent call on abandoned session returns 200 with original timestamp.
  - Test abandon completed session returns 409.
  - Test non-owner returns 403.

---

## Phase 6: Session State Query Endpoint & HTTP Error Mapping Audit
- [x] 6.1 Implement `GetRecallSessionStateUseCase` (or query adapter) and Route Handler `GET /api/recall/sessions/[id]`:
  - Return HTTP 200 with session metadata (id, status, cursor, totalCards, timestamps).
  - Enforce ownership isolation (non-owner -> 403).
- [x] 6.2 Audit and test centralized HTTP status code mapping across all domain errors (400, 403, 404, 409, 500).
- [x] 6.3 Integration tests for `GET /api/recall/sessions/[id]`.

---

## Phase 7: Full API Integration & Concurrency Acceptance
- [x] 7.1 End-to-end multi-endpoint workflow tests (Start -> Prompt -> Answer -> Complete / Abandon).
- [x] 7.2 API-level concurrent request serialization tests (concurrent submits, concurrent prompt calls).
- [x] 7.3 Client security tests: verify forbidden `driverId` injection across all endpoints.
- [x] 7.4 Production 401 UNAUTHENTICATED enforcement, trusted gateway verification, and Zero-Mutation invariant tests.

---

## Phase 8: Final Acceptance, Verification & Archive
- [x] 8.1 Run full regression suite (`npm test`).
- [x] 8.2 Run ESLint (`npm run lint`).
- [x] 8.3 Run Next.js production build (`npm run build`).
- [x] 8.4 Validate OpenSpec change (`npx openspec validate 09-recall-session-api --strict`).
- [x] 8.5 Run OpenSpec doctor (`npx openspec doctor`).
- [x] 8.6 Git diff and scope audit.
