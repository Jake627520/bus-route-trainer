# Proposal: 08-recall-session-flow

## Why
In Change 07, the pure domain SRS scheduling engine, due card queries, recall queue policy (70/30 target mix, dynamic backfill, deterministic ordering), and session planning use case (`PlanRecallSessionUseCase`) were established and verified. The output is an immutable `RecallSessionPlan` snapshot containing a fixed sequence of `cardIds`.

However, `RecallSessionPlan` is purely a planning artifact. To deliver a functional, resilient, and pedagogically sound memory trainer for bus drivers, the system requires a robust **Recall Session Execution Workflow Engine** that:
1. Transforms a `RecallSessionPlan` into an active, state-managed session lifecycle with explicit states (`IN_PROGRESS` → `COMPLETED` / `ABANDONED`).
2. Isolates the **Session Snapshot** from live SRS mutations: cards within an active session maintain their exact planned sequence (`plannedCardIds`) even if card SRS levels mutate concurrently in another context.
3. Manages prompt delivery, prompt timer initialization (`currentPromptStartedAt` initialized transactionally exactly once per cursor position), and strictly monotonic cursor progression (`currentPromptIndex`).
4. Atomically connects each prompt submission to the existing **Settlement Coordinator** with a strictly standardized **Deadlock-Free Lock Order**:
   - `RecallSession` (`FOR UPDATE`) → `RecallAttempt` lookup → (if new) `LearningCard` (`FOR UPDATE`) → `RecallAttempt` (`INSERT`) → `LearningCard` (`UPDATE`) → `RecallSession` (`UPDATE`).
5. Enforces an **Authoritative Idempotency Replay Contract**:
   - **Precedence Rule**: Existing `RecallAttempt` takes precedence over session lifecycle validation for replay/conflict detection. Lookup occurs before checking `status === IN_PROGRESS` so that duplicate retries on the final card or after session completion/abandonment safely replay the persisted outcome rather than throwing lifecycle errors.
   - Duplicate submissions matching the exact verbatim submission identity (`rawInput` exact string, `recallMode` exact enum) safely replay the persisted outcome snapshot directly from `RecallAttempt` without acquiring `LearningCard` locks or re-deriving from the current `LearningCard`.
   - Conflicting submissions (differing `rawInput` or `recallMode` for the same prompt) immediately raise `IdempotencyConflictError`.
6. Adheres to an **Authoritative Single-Clock Discipline**:
   - Each use case obtains exactly one authoritative `clock.now()` value per transaction and reuses that identical timestamp across all domain timestamps (`answeredAt`, `scheduleReview`, `completedAt`, etc.).
7. Enforces **Domain Invariant on Non-Empty Sessions**:
   - `RecallSession` requires `plannedCardIds.length > 0`. Empty session creation is rejected at the domain constructor level with `RecallSessionCannotBeEmptyError`.
8. Provides **race-safe session start and re-entry**:
   - Pre-condition: Requires an existing `DriverVariantProgress`. If missing, aborts immediately with `DriverNotEnrolledError` without generating plans or sessions.
   - Serialized via PostgreSQL row-level lock on `DriverVariantProgress` (`SELECT ... FOR UPDATE`), with planning queries executing inside the same transaction context.
   - Re-entry: returns existing active session on interruption without generating redundant plans.
9. Guarantees **safe non-rollback abandonment**:
   - Abandoning an active session marks it as `ABANDONED` without rolling back previously committed card reviews, while freeing the variant for a fresh session.

## What Changes
- **Architecture Principles**:
  - **Session is a workflow aggregate, NOT an SRS aggregate**: `LearningCard` remains the sole authority for long-term SRS memory state. `RecallSession` only tracks workflow progression (`plannedCardIds`, `currentPromptIndex`, `status`, `currentPromptStartedAt`).
  - **Session does NOT store prompts or expected answers**: Card identity and order are snapshotted in `plannedCardIds`. Prompt content is dynamically resolved against current GTFS topology (GTFS version pinning is explicitly deferred).
  - **Existing RecallAttempt Takes Precedence Over Session Lifecycle Validation**: An existing `RecallAttempt` indicates a previously settled question; idempotency resolution (replay vs. conflict) takes precedence over active-session checks (`status === IN_PROGRESS`), applying uniformly across `IN_PROGRESS`, `COMPLETED`, and `ABANDONED` states.
  - **Authoritative Clock Discipline**: One `Clock.now()` per transaction/use case operation, reused across all domain timestamp assignments.
- **Database Schema**:
  - Update `RecallSession` in `prisma/schema.prisma`:
    - Add `plannedCardIds String[] @default([]) @map("planned_card_ids")` to persist the immutable sequence of card UUIDs.
    - Status enum: `IN_PROGRESS`, `COMPLETED`, `ABANDONED`.
  - Update `RecallAttempt` in `prisma/schema.prisma` to store the historical settlement snapshot for idempotent replay:
    - `resultingState CardState @map("resulting_state")`
    - `resultingSrsLevel Int @map("resulting_srs_level")`
    - `resultingNextReviewAt DateTime? @map("resulting_next_review_at")`
    - `resultingRepetitions Int @map("resulting_repetitions")`
    - `resultingLapses Int @map("resulting_lapses")`
- **Domain Layer**:
  - Enhance `RecallSession` aggregate:
    - `plannedCardIds: readonly string[]` snapshot (validated non-empty).
    - Lifecycle transitions: `advance(now)`, `complete(now)`, `abandon(now)`.
    - Strict cursor invariants:
      - `IN_PROGRESS`: `0 <= currentPromptIndex < plannedCardIds.length`.
      - `COMPLETED`: `currentPromptIndex === plannedCardIds.length`.
      - `ABANDONED`: terminal, cursor frozen at current index.
- **Application Layer**:
  - `StartPlannedRecallSessionUseCase`:
    - Executes inside a transaction locking `DriverVariantProgress` (`FOR UPDATE`).
    - Throws `DriverNotEnrolledError` if progress record does not exist.
    - Returns existing `IN_PROGRESS` session if present (`isNew: false`).
    - If absent, invokes `PlanRecallSessionUseCase` within the same transaction context, persists new `IN_PROGRESS` session with `plannedCardIds`, and returns `isNew: true`.
  - `GetCurrentSessionPromptUseCase`:
    - Transactionally locks `RecallSession` (`FOR UPDATE`) to guarantee `currentPromptStartedAt` is set exactly once per cursor position even under concurrent GET requests.
    - Resolves prompt dynamically for `plannedCardIds[session.currentPromptIndex]`.
  - `SubmitSessionAnswerUseCase`:
    - Delegates to `RecallSettlementCoordinator` adhering to the standard precedence order:
      1. Lock `RecallSession` (`FOR UPDATE`) and validate `session.driverId === command.driverId`.
      2. Lookup `RecallAttempt` at `(sessionId, promptIndex)`:
         - Exact verbatim match (`rawInput`, `recallMode`) → replay persisted snapshot directly and return (zero card locks).
         - Divergent identity → throw `IdempotencyConflictError`.
      3. If no existing attempt:
         - Validate `session.status === IN_PROGRESS` and `promptIndex === session.currentPromptIndex`.
         - Lock target `LearningCard` (`FOR UPDATE`).
         - Evaluate answer correctness (`PASS` / `FAIL`).
         - Pure SRS transition via `scheduleReview(card, outcome, authoritativeNow)`.
         - Insert `RecallAttempt` with resulting 5 scheduling fields.
         - Update `LearningCard` 5 state fields.
         - Advance cursor ($N-1 \to N$); if $N$, mark `COMPLETED` and record `completedAt`.
  - `AbandonRecallSessionUseCase`:
    - Transitions active session to `ABANDONED` with `abandonedAt = now`. Past card reviews remain committed.
- **Infrastructure Layer**:
  - Update `PrismaRecallRepository` to persist and load `plannedCardIds` and handle transactional session locks.
  - Update `PrismaRecallSettlementCoordinator` with standardized locking order and attempt snapshot persistence.
- **Non-Goals for Change 08**:
  - HTTP REST/Next.js API routes (deferred until Change 08 application contracts are fully verified).
  - Web UI / PWA views (deferred).
  - Changing SRS ladder intervals or mastery algorithms.
