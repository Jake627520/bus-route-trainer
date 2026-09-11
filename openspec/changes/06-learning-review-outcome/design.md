# Design: 06-learning-review-outcome

## 1. Architectural Decisions & Problem Breakdown

This document specifies the technical design for **Change 06: Learning Result / Review Outcome**. It establishes how an operational retrieval event (`RecallAttempt`) translates into a decoupled learning outcome (`ReviewOutcome`), driving deterministic state transitions on `LearningCard` and updating variant status on `DriverVariantProgress` within a single atomic database transaction.

---

## 2. Review Outcome Domain Representation

### 2.1 The Concept
`RecallAttempt` is an operational record of an interactive session (recording raw driver input, prompt index, milliseconds taken, evaluated answer).
`ReviewOutcome` is a normalized **domain Value Object** representing an evaluation result:

```typescript
export type ReviewResult = 'PASS' | 'FAIL';

/**
 * Minimal source type for Change 06.
 * Future assessment modes (QUIZ, LISTENING, etc.) will be added in future changes.
 */
export type ReviewSourceType = 'RECALL';

export interface ReviewOutcome {
  readonly sourceType: ReviewSourceType;
  readonly sourceAttemptId: string;
  readonly driverId: string;
  readonly targetVariantKey: string;
  readonly cardKey: string;
  readonly result: ReviewResult;
  readonly evaluatedAt: Date;
  readonly durationMs?: number;
}
```

### 2.2 Formal Architectural Classification
- **Domain Value Object**: `ReviewOutcome` is an immutable domain Value Object. It is **not a persisted entity** and **not an Event Bus / Domain Event** in Change 06.
- **Persistence Boundary**: Change 06 does **not** create a `review_outcomes` database table. The operational audit trail resides in `recall_attempts`, and cognitive learning state resides in `learning_cards`.
- If an asynchronous event bus or domain event distribution mechanism is needed in the future, it will be designed under a dedicated change.

---

## 3. RecallAttempt → ReviewOutcome Settlement Timing

### 3.1 Options Comparison

| Dimension | Option A: Immediate Settlement (Per Attempt) | Option B: Batch Settlement (Session End) |
|---|---|---|
| **Trigger Point** | Immediately upon valid answer submission in `SubmitRecallAnswerUseCase` | Upon `CompleteRecallSessionUseCase` |
| **Crash / Abandonment** | **Zero data loss**: All answered prompts are reflected in `LearningCard` even if session is abandoned or browser closed | **High data loss**: Dropped sessions discard all learning progress |
| **Transaction Boundary** | Atomic inside `SubmitRecallAnswer`: Attempt write + Card transition + Progress status update + Session advance in one DB transaction | Single large batch transaction or eventual consistency at session termination |
| **Concurrency & Idempotency** | Protected per `(sessionId, promptIndex)` DB unique constraint | Complex rollback / partial failure handling if batch crashes mid-way |
| **Multi-Modality (Future)** | Universal: A single standalone Quiz question or Recall prompt settles uniformly | Requires artificial "batch session" wrapping even for single ad-hoc questions |

### 3.2 Recommendation & Decision
**Adopt Option A (Immediate Settlement)**.
Bus drivers often practice in short intervals (e.g., waiting at a terminal or depot). If a session disconnects or is abandoned, their cognitive effort must not be lost. Immediate settlement treats each completed attempt as an immutable historical fact and immediately reflects it in memory state.

---

## 4. LearningCard State Machine

### 4.1 State Definitions
- **`NEW`**: The stop card has been generated for the variant, but the driver has never actively recalled it.
- **`LEARNING`**: The card is in active initial acquisition. The driver is familiarizing themselves with the stop sequence.
- **`REVIEW`**: The card has been recalled correctly at least once during acquisition. It is in consolidation.
- **`MASTERED`**: The driver has sequentially traversed all three learning stages (`NEW` → `LEARNING` → `REVIEW` → `MASTERED`).

### 4.2 Transition Matrix

| Current State | PASS Outcome | FAIL Outcome | Rationale |
|---|---|---|---|
| **`NEW`** | `LEARNING` | `LEARNING` | First exposure always moves card into active learning. |
| **`LEARNING`** | `REVIEW` | `LEARNING` | Success advances to consolidation stage; failure remains in acquisition. |
| **`REVIEW`** | `MASTERED` | `LEARNING` | Success advances to mastery; failure drops back to acquisition. |
| **`MASTERED`** | `MASTERED` | `REVIEW` | Occasional slip demotes to review for verification; does not treat driver as complete novice. |

### 4.3 Semantic Clarification: Stage Progression vs Consecutive Passes
- **`MASTERED` is NOT "3 consecutive passes"**:
  A driver may experience:
  `NEW` (+PASS) → `LEARNING` (+FAIL) → `LEARNING` (+PASS) → `REVIEW` (+PASS) → `MASTERED`.
  Here, 4 total attempts occurred with an intermediate failure, yet the card validly attained `MASTERED` because it traversed through the three pedagogical stages.
- **Core Invariant**: State transition is strictly evaluated as a pure function of:
  $$\text{NextState} = f(\text{CurrentState}, \text{ReviewResult})$$
  **CardState is NEVER inferred or derived from `repetitions >= N`**.

---

## 5. `repetitions` and `lapses` Semantics

### 5.1 `repetitions`
- **Semantic Definition**: **Total Cumulative Successful Retrievals**.
- **Rule**:
  - `PASS` → `repetitions + 1`
  - `FAIL` → `repetitions` unchanged
- **Invariant**: `repetitions` **never resets to 0** on failure. It is a strictly monotonic non-decreasing metric reflecting total lifetime correct recall volume. It is independent of the state machine.

### 5.2 `lapses`
- **Semantic Definition**: **Post-Consolidation Forgetting Count**.
- **Rule**:
  - `REVIEW` + `FAIL` → `lapses + 1`
  - `MASTERED` + `FAIL` → `lapses + 1`
  - `NEW` + `FAIL` → `lapses` unchanged (`+0`)
  - `LEARNING` + `FAIL` → `lapses` unchanged (`+0`)
  - Any `PASS` → `lapses` unchanged
- **Invariants**:
  - `lapses >= 0` and is **monotonically non-decreasing**.
  - Initial acquisition errors during `NEW` or `LEARNING` are natural learning hurdles, not lapses of consolidated memory.

---

## 6. `MASTERED` Degradation Strategy

### 6.1 Options for `MASTERED + FAIL`

| Option | Transition | Pros | Cons |
|---|---|---|---|
| **Option 1: Demote to `REVIEW` (Adopted)** | `MASTERED` → `REVIEW` | Fair and realistic: A licensed driver who misses a stop once needs re-verification, not demotion to complete novice. | Allows recovery to `MASTERED` with 1 subsequent `PASS`. |
| **Option 2: Demote to `LEARNING`** | `MASTERED` → `LEARNING` | Highly punitive; ensures safety-critical overlearning. | Frustrating for drivers; treats an isolated lapse identically to a completely unlearned stop. |
| **Option 3: Retain `MASTERED` with lapse counter** | `MASTERED` → `MASTERED` | Retains variant completion statistics. | Dangerous for transit operations: a driver who forgot a stop is still marked as 100% mastered. |

### 6.2 Recovery Lifecycle
```text
MASTERED
   │
 FAIL (lapse +1)
   ▼
 REVIEW ──FAIL (lapse +1)──▶ LEARNING
   │                           │
  PASS                        PASS
   ▼                           ▼
MASTERED                    REVIEW
```
This multi-tier recovery prevents disproportionate penalty for isolated lapses, while firmly demoting recurring errors back to full re-acquisition.

---

## 7. Variant Progress Percentage & Schema Alignment

### 7.1 Schema Verification & Zero-Migration Rule
In Change 04, the existing database models are defined as:
- **`LearningCard`**: `id`, `progressId`, `cardKey`, `cardType`, `state`, `nextReviewAt`, `repetitions`, `lapses`.
  - Persisted in Change 06: `state`, `repetitions`, `lapses`.
  - **Strict Scope Boundary**: `nextReviewAt` is **untouched** (reserved for Change 07). Non-existent columns such as `lastReviewedAt` are **NOT in the schema and NOT added**.
- **`DriverVariantProgress`**: `id`, `driverId`, `routeId`, `directionId`, `targetVariantKey`, `status`, `enrolledAt`, `lastStudiedAt`.
  - Persisted in Change 06: `status` (`NOT_STARTED | IN_PROGRESS | MASTERED`).
  - **Strict Scope Boundary**: `progressPercent` is **NOT a database column and NOT added**. It is purely a derived/computed value.

### 7.2 Derived Progress Calculation (Application / Read Layer)
```typescript
progressPercent = totalCards > 0
  ? Math.round((masteredCardCount / totalCardCount) * 100)
  : 0;
```
- **Why Unweighted?**: In transit operations, a driver is only certified on a route when all stops are mastered. Unweighted percentage provides unambiguous transparency without mixing subjective weights or premature SRS difficulty factors.
- **`status` Derivation for Persistence**:
  - `NOT_STARTED`: `masteredCardCount === 0 && learningCardCount === 0 && reviewCardCount === 0`
  - `IN_PROGRESS`: Any card has moved out of `NEW`, but `masteredCardCount < totalCardCount`
  - `MASTERED`: `masteredCardCount === totalCardCount` (and `totalCardCount > 0`)

---

## 8. Single Atomic Transaction & Outside-Transaction P2002 Recovery

### 8.1 The Core Problem: PostgreSQL Aborted Transaction State
In PostgreSQL, when a statement triggers a constraint violation (e.g. `P2002` unique constraint on `(sessionId, promptIndex)`), PostgreSQL immediately puts the transaction block into an **aborted state** (`25P02: current transaction is aborted, commands ignored until end of transaction block`).
**Consequence**: You cannot execute a `SELECT` query inside the same transaction block after a `P2002` error. The write transaction MUST terminate/rollback first, and recovery must be performed in a separate read operation outside the failed transaction.

### 8.2 Architecture: `RecallSettlementCoordinator`
We introduce the `RecallSettlementCoordinator` application port:

```typescript
export interface SettleRecallAttemptInput {
  readonly sessionId: string;
  readonly promptIndex: number;
  readonly driverId: string;
  readonly targetVariantKey: string;
  readonly cardKey: string;
  readonly driverAnswer: string;
  readonly expectedAnswer: string;
  readonly outcome: 'PASS' | 'FAIL';
  readonly durationMs: number;
  readonly isLastPrompt: boolean;
  readonly nextPromptSnapshot?: {
    readonly promptIndex: number;
    readonly cardKey: string;
    readonly promptType: string;
    readonly promptData: Record<string, unknown>;
    readonly expectedAnswer: string;
  };
}

export interface SettleRecallAttemptOutput {
  readonly attempt: RecallAttempt;
  readonly card: LearningCard;
  readonly progressStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'MASTERED';
  readonly session: RecallSession;
  readonly isDuplicate: boolean;
}

export interface RecallSettlementCoordinator {
  settleAttempt(input: SettleRecallAttemptInput): Promise<SettleRecallAttemptOutput>;
}
```

### 8.3 Detailed Transaction & Recovery Flow

```text
[Step 1]: Try Atomic Settlement Transaction ($transaction)
  BEGIN PostgreSQL Transaction:
    1. INSERT INTO recall_attempt (sessionId, promptIndex, cardKey, ...)
    2. SELECT learning_card WHERE progressId = progress.id AND cardKey = input.cardKey
    3. Calculate NextState = evaluateCardTransition(card.state, outcome)
    4. Calculate new repetitions and lapses
    5. UPDATE learning_card SET state = NextState, repetitions = newRep, lapses = newLapse
    6. Aggregate variant card states and calculate new DriverVariantProgress.status
    7. UPDATE driver_variant_progress SET status = newStatus
    8. UPDATE recall_session (advance currentPromptIndex, snapshot, status)
  COMMIT PostgreSQL Transaction.
  RETURN SettleRecallAttemptOutput (isDuplicate: false).

[Step 2]: Catch Error & Precise Recovery Outside Failed Transaction
  If Error caught:
    - Check if error is PrismaClientKnownRequestError with code === 'P2002'
      AND target fields match ['sessionId', 'promptIndex'] (or constraint name).
    - If NOT matching (sessionId, promptIndex):
        --> RETHROW immediately (do not swallow unrelated errors).
    - If MATCHING (sessionId, promptIndex):
        --> The failed transaction has ALREADY ended / rolled back.
        --> Execute fresh read query (OUTSIDE the failed transaction):
            const existingAttempt = await prisma.recallAttempt.findUnique({
              where: { sessionId_promptIndex: { sessionId, promptIndex } }
            });
        --> Fetch current card, progress status, session.
        --> RETURN SettleRecallAttemptOutput (isDuplicate: true).
        --> State transitions, counter increments, and session advances are NOT executed.
```

---

## 9. Required Concurrency Scenarios & Proof of Safety

### Scenario A — Request A Commits First (Concurrent Race)
1. **Request A** begins `$transaction`, successfully inserts `RecallAttempt` for `(session_1, index_0)`.
2. **Request B** (concurrent twin request) attempts `INSERT RecallAttempt` for `(session_1, index_0)` while A is executing or right after A commits.
3. Database rejects B with `P2002` unique constraint violation on `(sessionId, promptIndex)`.
4. Transaction B terminates and rolls back.
5. Coordinator catches B's `P2002`, confirms constraint target is `(sessionId, promptIndex)`, and initiates a new read query outside the transaction.
6. Coordinator retrieves the attempt committed by Request A and returns it with `isDuplicate: true`.
- **Audit Outcome**:
  - `RecallAttempt` count = **1**
  - `LearningCard` transition applied = **1 time**
  - `repetitions` incremented = **1 time**
  - `lapses` incremented = **1 time** (if applicable)
  - `RecallSession` advanced = **1 time**

### Scenario B — Request A Rolls Back (Midway Failure)
1. **Request A** begins `$transaction`, inserts `RecallAttempt`, but encounters an unexpected error during session advancement.
2. Transaction A is aborted and fully **rolled back by PostgreSQL** (the attempt is removed).
3. **Request B** (subsequent attempt or concurrent thread) begins its `$transaction`.
4. Because A's attempt was rolled back, B's `INSERT RecallAttempt` succeeds without constraint collision.
5. Request B completes card transition, progress status update, session cursor advance, and commits.
- **Audit Outcome**:
  - `RecallAttempt` count = **1**
  - `LearningCard` transition applied = **1 time**
  - No orphaned or partially-committed state.

### Scenario C — Retry After Successful Commit (Sequential Duplicate)
1. Client submits answer for `(session_1, index_0)`, which successfully commits.
2. Network timeout causes client to retry `(session_1, index_0)`.
3. The coordinator catches the existing attempt (either pre-checked or via `P2002` handler) and returns the existing result with `isDuplicate: true`.
- **Audit Outcome**:
  - State machine is **NOT re-evaluated**.
  - `repetitions` is **NOT incremented again**.
  - `lapses` is **NOT incremented again**.
  - `RecallSession` cursor is **NOT advanced again**.

---

## 10. Persistence Strategy: Option A vs Option B

- **Option A (Adopted)**: In-memory `ReviewOutcome` Value Object. `recall_attempts` serves as the durable operational log; `learning_cards` holds the current aggregate state.
- **Option B (Rejected)**: Dedicated `review_outcomes` table. Rejected as premature write amplification (YAGNI).
- **Prisma Schema Impact**: **0 new tables, 0 new columns, 0 migrations in Change 06**.

---

## 11. Production Composition Root vs HTTP Production Entry Point

### 11.1 Composition Root Architecture
Change 06 establishes the production composition root `createRecallUseCases(prisma, promptStrategy)` in `src/infrastructure/recall/recall-composition.ts`.
This composition root explicitly injects `PrismaRecallSettlementCoordinator` into `SubmitRecallAnswerUseCase`, ensuring that any entry point consuming recall use cases executes the Change 06 single-transaction atomic settlement.

### 11.2 Scope Reconciliation
- **`PRODUCTION_COMPOSITION: PASS`**: The composition root factory correctly binds `PrismaRecallSettlementCoordinator`, verified by integration tests.
- **`PRODUCTION_REQUEST_PATH: DEFERRED`**: No Recall HTTP/API routes currently exist in the project (Change 05 explicitly scoped Recall to Domain and Application layers). Production HTTP endpoints and UI drivers are intentionally deferred to future experience changes to prevent scope creep.

---

## 12. Architecture Invariants Summary

1. **Pure Domain Value Object**: `ReviewOutcome` is an immutable Value Object (not a persisted entity, not an Event Bus message).
2. **Immediate Settlement**: Every valid recall attempt triggers immediate settlement (no delayed batching).
3. **Single Transaction Atomicity**: Attempt creation, card transition, counter updates, progress status update, and session cursor advancement execute inside a single atomic PostgreSQL transaction via `RecallSettlementCoordinator`.
4. **P2002 Recovery Outside Transaction**: If `P2002` occurs on `(sessionId, promptIndex)`, recovery query is performed strictly **after the failed transaction has ended**, returning the existing attempt with `isDuplicate: true`.
5. **P2002 Target Precision**: Only unique violations specifically on `(sessionId, promptIndex)` trigger idempotent recovery; unrelated unique violations are rethrown.
6. **State Machine Invariant**: $\text{NextState} = f(\text{CurrentState}, \text{ReviewResult})$. Card state is **never** derived from `repetitions >= N`.
7. **Mastery Semantic**: `MASTERED` means sequentially traversing `NEW` → `LEARNING` → `REVIEW` → `MASTERED` (not "3 consecutive passes").
8. **Repetitions Monotonicity**: `repetitions` counts total cumulative correct recalls (`PASS`). It never resets on failure.
9. **Lapses Monotonicity**: `lapses` counts post-consolidation failures only (`REVIEW`/`MASTERED` + `FAIL`). It is monotonically non-decreasing (`lapses >= 0`). Errors during `NEW`/`LEARNING` do not increment lapses.
10. **Mastered Slip Recovery**: `MASTERED + FAIL → REVIEW` with `lapses + 1`.
11. **Derived Progress Percentage**: `progressPercent` is calculated on-the-fly (`Math.round(mastered / total * 100)`), never persisted as a database column.
12. **Untouched nextReviewAt**: `LearningCard.nextReviewAt` is strictly unchanged by Change 06.
13. **Strict Zero-Migration Scope Guard**: Zero edits to `prisma/schema.prisma`, zero migrations created.
14. **Production Entry Point Boundary**: Production composition root is verified; HTTP entry points are deferred to future experience changes.
