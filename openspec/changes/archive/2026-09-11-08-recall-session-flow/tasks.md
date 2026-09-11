# Tasks: 08-recall-session-flow

## Phase 1: Domain & Session State Machine Contracts
- [x] 1.1 Enhance `RecallSession` domain aggregate:
  - Add `plannedCardIds: readonly string[]`.
  - Enforce non-empty invariant: `plannedCardIds.length > 0` (throw `RecallSessionCannotBeEmptyError` on empty array).
  - State machine methods: `advance(now)`, `complete(now)`, `abandon(now)`.
  - Enforce cursor invariants:
    - `IN_PROGRESS`: `0 <= currentPromptIndex < plannedCardIds.length`.
    - `COMPLETED`: `currentPromptIndex === plannedCardIds.length`.
    - `ABANDONED`: terminal state, cursor frozen at current index.
  - Remove prompt content properties from Session (prompts resolved dynamically).
- [x] 1.2 Unit test `RecallSession` aggregate:
  - Test rejecting instantiation with empty `plannedCardIds` array (`RecallSessionCannotBeEmptyError`).
  - Test initial state is `IN_PROGRESS` with `currentPromptIndex = 0`.
  - Test monotonic cursor advancement `0 -> 1 -> ... -> N-1`.
  - Test transition to `COMPLETED` sets `currentPromptIndex = N` and `completedAt`.
  - Test transition to `ABANDONED` freezes cursor and sets `abandonedAt`.
  - Test advance/complete/abandon rejected from terminal states.

---

## Phase 2: Schema Migration & Persistence Adapter
- [x] 2.1 Update `prisma/schema.prisma`:
  - Add `plannedCardIds String[] @default([]) @map("planned_card_ids")` to `RecallSession`.
  - Add `resultingState`, `resultingSrsLevel`, `resultingNextReviewAt`, `resultingRepetitions`, `resultingLapses` to `RecallAttempt`.
- [x] 2.2 Create and apply Prisma migration:
  - Run `npx prisma migrate dev --name add_session_flow_fields`.
- [x] 2.3 Update `PrismaRecallRepository`:
  - Persist and retrieve `plannedCardIds` array and resulting snapshot fields cleanly.
- [x] 2.4 Integration tests for `PrismaRecallRepository`.

---

## Phase 3: Start Session with Progress Row-Locking & Transactional Planning
- [x] 3.1 Implement `StartPlannedRecallSessionUseCase`:
  - Enforce pre-condition: if `DriverVariantProgress` does not exist, throw `DriverNotEnrolledError` immediately.
  - Execute transaction locking `DriverVariantProgress` row (`SELECT ... FOR UPDATE`).
  - If active `IN_PROGRESS` session exists, return with `isNew: false`.
  - If none exists, invoke planning using the same transaction context.
    - If `plan === null`, return `noEligibleCards`.
    - Persist new `RecallSession` with `plannedCardIds` and return `isNew: true`.
- [x] 3.2 Unit and concurrency integration tests for `StartPlannedRecallSessionUseCase`:
  - Test missing progress throws `DriverNotEnrolledError`.
  - Test new session creation from plan.
  - Test re-entry returning existing active session.
  - Test concurrent start requests serialized by progress row lock (preventing duplicate active sessions).
  - Test no eligible cards scenario.

---

## Phase 4: Prompt Delivery & Transactional Timer Initialization
- [x] 4.1 Implement `GetCurrentSessionPromptUseCase`:
  - Execute inside transaction with `RecallSession` row lock (`FOR UPDATE`).
  - Invariant: initialize `currentPromptStartedAt` exactly once per cursor position (subsequent GET calls do not overwrite).
  - Resolve card at `plannedCardIds[currentPromptIndex]` and dynamically construct prompt from GTFS topology.
- [x] 4.2 Unit and concurrency tests for prompt resolution and timer idempotency under concurrent GET requests.

---

## Phase 5: Standard Lock Order, Settlement, and Authoritative Idempotency Replay
- [x] 5.1 Update `RecallSettlementCoordinator`:
  - Single database transaction boundary with standardized lock order and attempt precedence:
    1. Lock `RecallSession` (`SELECT ... FOR UPDATE`).
    2. Validate session ownership (`session.driverId === command.driverId`).
    3. Lookup `RecallAttempt` by unique `(sessionId, promptIndex)` BEFORE checking session status or locking card:
       - Exact identity match (`rawInput` exact string, `recallMode` exact enum): COMMIT and return cached result directly from `RecallAttempt` persisted snapshot (zero `LearningCard` locks, zero SRS re-execution).
       - Divergent identity: ROLLBACK and throw `IdempotencyConflictError`.
    4. If attempt does not exist (New Submission):
       - Validate `session.status === IN_PROGRESS` and `session.currentPromptIndex === promptIndex`.
       - Lock `LearningCard` (`SELECT ... FOR UPDATE`).
       - Evaluate answer and execute `scheduleReview(card, outcome, authoritativeNow)`.
       - Insert `RecallAttempt` storing verbatim `rawInput`, `recallMode`, and the 5 resulting SRS snapshot fields.
       - Update `LearningCard` (state, srsLevel, nextReviewAt, repetitions, lapses).
       - Advance session cursor $N-1 \to N$; if $N$, set status `COMPLETED` and `completedAt`.
       - COMMIT and return settlement result.
- [x] 5.2 Implement `SubmitSessionAnswerUseCase`.
- [x] 5.3 Unit and concurrency integration tests:
  - Sequential answering through all cards to completion ($N-1 \to N$).
  - Out-of-order `promptIndex` rejected.
  - Exact duplicate submission returns cached snapshot without re-scheduling or cursor advance.
  - Duplicate submission retry on `COMPLETED` session successfully replays without lifecycle error.
  - Duplicate submission retry on `ABANDONED` session successfully replays without lifecycle error.
  - Conflicting submission with different answer raises `IdempotencyConflictError`.
  - Deadlock-free concurrency: two sessions settling same card concurrently maintain valid sequential SRS progression.

---

## Phase 6: Session Abandonment
- [x] 6.1 Implement `AbandonRecallSessionPort` and `PrismaAbandonRecallSessionAdapter`:
  - `lockSession(sessionId)` via `SELECT ... FROM recall_session WHERE id = $sessionId FOR UPDATE`.
  - `markSessionAbandoned(sessionId, abandonedAt)` to update status to `ABANDONED`, set `abandonedAt`, clear `currentPromptStartedAt`, preserving `currentPromptIndex`.
- [x] 6.2 Implement `AbandonRecallSessionUseCase`:
  - Validate session ownership (`session.driverId === command.driverId`).
  - Idempotent replay if already `ABANDONED` (preserve original `abandonedAt`).
  - Throw `CannotAbandonCompletedSessionError` if already `COMPLETED`.
  - Freeze `currentPromptIndex` without mutating it to $N$.
  - Free variant for immediate fresh session creation.
- [x] 6.3 Integration & concurrency test suite in `src/__tests__/application/recall/abandon-recall-session-use-case.test.ts` (10 tests):
  1. `transitions IN_PROGRESS session to ABANDONED and clears timer`
  2. `preserves settled Attempts and LearningCard SRS states committed before abandonment`
  3. `leaves in-flight prompt untouched without creating RecallAttempt or mutating card SRS`
  4. `is idempotent when session is already ABANDONED and preserves original abandonedAt`
  5. `rejects abandoning a COMPLETED session with CannotAbandonCompletedSessionError`
  6. `rejects request if driver is not session owner with SessionOwnershipError`
  7. `frees driver variant and creates a completely new session with fresh plannedCardIds snapshot`
  8. `freezes currentPromptIndex at partial settlement without setting it to totalCards`
  9. `serializes concurrent Abandon vs Submit: when Abandon wins lock, subsequent new Submit fails with SessionNotActiveError`
  10. `serializes concurrent Abandon vs Submit: when final Submit wins lock, subsequent Abandon fails with CannotAbandonCompletedSessionError`

---

## Phase 7: Full Verification & Regression
- [x] 7.1 Run full regression suite (`npm test`).
- [x] 7.2 Run ESLint (`npm run lint`).
- [x] 7.3 Run Next.js production build (`npm run build`).
- [x] 7.4 Validate OpenSpec change (`npx openspec validate 08-recall-session-flow --strict`).
- [x] 7.5 Run OpenSpec doctor (`npx openspec doctor`).
- [x] 7.6 Git diff and scope audit.
