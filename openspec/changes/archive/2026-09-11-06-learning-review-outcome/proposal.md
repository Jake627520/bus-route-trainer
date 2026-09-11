# Proposal: 06-learning-review-outcome

## 1. Problem Statement & Motivation

In Change 05 (`05-recall-session-domain`), the system established a robust, race-safe, and deterministic recall training framework. Drivers answer active memory retrieval challenges, and their operational telemetry is persisted as immutable `RecallAttempt` records (`outcome: PASS | FAIL`, `durationMs`, `answeredAt`, `promptIndex`, `cardKey`).

However, currently the system has no **learning feedback loop**:
- `RecallAttempt` is written to the database, but the driver's corresponding `LearningCard` remains frozen in its initial state (`NEW`, `repetitions: 0`, `lapses: 0`).
- The aggregate `DriverVariantProgress` remains at `NOT_STARTED` or default status, with no mastery metrics.
- A single test result (`PASS` or `FAIL`) is fundamentally an *operational retrieval observation*, whereas card mastery (`MASTERED`) is an *accumulated cognitive state*. These two layers must be bridged by an explicit, decoupled domain concept.

Change 06 introduces **`ReviewOutcome`** and the **`LearningCard` State Transition Engine**:
1. Translates a retrieval attempt (`RecallAttempt`) into a normalized domain Value Object (`ReviewOutcome`).
2. Evaluates the state transition matrix on `LearningCard` (`NEW` → `LEARNING` → `REVIEW` → `MASTERED`), adjusting cumulative counters (`repetitions`, `lapses`).
3. Updates `DriverVariantProgress.status` (`NOT_STARTED | IN_PROGRESS | MASTERED`) and provides a derived, unweighted progress percentage (`progressPercent = Math.round(masteredCount / totalCount * 100)`) without adding database columns.
4. Coordinates the entire settlement pipeline within a **single atomic database transaction**, with race recovery executing outside failed transactions.

---

## 2. Architecture & Bounded Contexts

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Retrieval Domain (Change 05)                              │
│    RecallSession → RecallPrompt → DriverAnswer              │
│    → DeterministicEvaluator → RecallAttempt (PASS / FAIL)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Translates to VO)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Learning Review Outcome Layer (Change 06)                │
│    ReviewOutcome (Domain Value Object)                      │
│    ├── Source: RECALL (Future Change: QUIZ, etc.)           │
│    ├── Target: driverId, targetVariantKey, cardKey          │
│    └── Evaluation: PASS / FAIL, evaluatedAt                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Drives State Machine)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Driver Learning Aggregate (Change 04 & 06)               │
│    LearningCard (Persisted: state, repetitions, lapses)     │
│    ├── State Machine: NEW → LEARNING → REVIEW → MASTERED   │
│    │   (Sequentially completes 3 pedagogical stages)         │
│    ├── Cumulative: repetitions (total correct retrievals)   │
│    ├── Negative: lapses (failures in REVIEW/MASTERED only)  │
│    └── Untouched: nextReviewAt (Reserved for Change 07)     │
│    DriverVariantProgress (Persisted: status)                │
│    └── Derived: progressPercent = (mastered / total) * 100  │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Prepares for scheduling)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Future SRS / Due Scheduling (Change 07 - OUT OF SCOPE)   │
│    SchedulingStrategy (Leitner / FSRS-lite)                 │
│    → nextReviewAt timestamp calculation & Due Queue        │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Core Architectural Boundaries & Decisions

### 3.1 ReviewOutcome as a Domain Value Object (Not a Persisted Event)
`RecallAttempt` is an immutable operational record of a driver's raw input, prompt index, and duration. `ReviewOutcome` is a **pure domain Value Object** stating:
*"For card X of variant Y, driver D demonstrated a PASS/FAIL result at timestamp T."*
- `ReviewOutcome` is **not an event bus message** and is **not persisted to a new database table** in Change 06.
- If an asynchronous event bus or domain event dispatcher is required in the future, it will be evaluated in a dedicated architectural change.

### 3.2 Single Atomic Database Transaction & Outside-Tx Recovery
All state mutations resulting from a submitted answer execute within a **single PostgreSQL transaction**:
1. Create `RecallAttempt`
2. Evaluate `ReviewOutcome` Value Object
3. Transition `LearningCard` (`state`, `repetitions`, `lapses`)
4. Update `DriverVariantProgress.status`
5. Advance or complete `RecallSession` cursor

If any step fails, the entire transaction rolls back.
If a concurrent duplicate submission triggers a unique constraint violation (`P2002` on `sessionId_promptIndex`), the failed transaction ends/rolls back immediately. **Duplicate recovery (reading the existing attempt and returning without state mutation) occurs strictly outside the failed transaction via a separate read operation.**

### 3.3 Zero Prisma Schema Changes & Field Scope Alignment
Change 06 introduces **ZERO schema changes and ZERO migrations**:
- `LearningCard`: Only existing columns `state`, `repetitions`, and `lapses` are updated. Non-existent columns such as `lastReviewedAt` are **not added and not written**. Existing column `nextReviewAt` is **strictly untouched**.
- `DriverVariantProgress`: Only existing column `status` is persisted. `progressPercent` is **purely a computed/derived value** in the application/presentation layer and is not added to the database schema.

### 3.4 Mastery Semantic Definition
`MASTERED` represents completing the sequence of three pedagogical stages (`NEW` → `LEARNING` → `REVIEW` → `MASTERED`). It does **not** represent "three consecutive passes" (intermediate failures during `LEARNING` retain the card in `LEARNING` without resetting prior exposure).

### 3.5 Strict Absence of SRS Time Scheduling (Change 07 Scope Guard)
Change 06 **strictly does NOT touch `nextReviewAt`**, does NOT calculate review intervals (hours/days), and does NOT implement Leitner or FSRS algorithms. It only manages **discrete state transitions** and counter increments.

---

## 4. Explicit Out of Scope (Red Lines)

The following capabilities are **STRICTLY EXCLUDED** from Change 06:

- ❌ **No Prisma schema modifications**: Zero edits to `prisma/schema.prisma`, zero migrations.
- ❌ **No new database tables**: No `review_outcomes` table.
- ❌ **No new columns**: No `lastReviewedAt` on `LearningCard`, no `progressPercent` on `DriverVariantProgress`.
- ❌ **No mutation of `nextReviewAt`**: This field remains managed by Change 07.
- ❌ **No SRS scheduling algorithms**: No FSRS, SM-2, Leitner, interval formulas, or due date math.
- ❌ **No Event Bus or Event Dispatcher**: ReviewOutcome is strictly an in-memory Value Object.
- ❌ **No Quiz Engine or Presentation UI**: No multiple-choice options, distractors, or quiz UI widgets.
- ❌ **No SRS Review Queue API**: Review queues based on due timestamps belong to Change 07/08.
- ❌ **No Recall HTTP API Endpoints / UI**: Change 06 delivers the domain settlement logic and production composition root (`createRecallUseCases`), but does not introduce new Recall HTTP routes or UI widgets; production request entry points are intentionally deferred to future experience changes to avoid scope creep.
- ❌ **No Driver Authentication**: Continues using `DEFAULT_DRIVER_ID`.
- ❌ **No Topology Mutation / Feed Migration**: GTFS and RouteVariant identities remain read-only models.
- ❌ **No AI, Audio, GPS, or Map Features**: Strictly algorithmic domain logic.

---

## 5. Expected Business & Engineering Impact

- **Deterministic Learning Progression**: Bus drivers observe tangible progress as cards advance from `NEW` towards `MASTERED`.
- **Zero Partial-Commit Risk**: Driver learning progress, attempt logging, and session state advance atomically in one transaction.
- **Race-Safe Concurrency**: Idempotency on `(sessionId, promptIndex)` guarantees safe duplicate submission handling without double-counting counters.
- **Clean Subsystem Decoupling**: Prepares an uncompromised foundation for Change 07 (SRS Scheduling) to operate purely on card states and histories.
