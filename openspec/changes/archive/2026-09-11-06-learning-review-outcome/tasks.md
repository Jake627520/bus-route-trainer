# Tasks: 06-learning-review-outcome

---

## Phase 1: Pure Domain Modeling (Review Outcome & State Machine)
- [x] 1.1 Define `ReviewOutcome` domain Value Object and types in `src/domain/learning/`:
  - `ReviewResult`: `'PASS' | 'FAIL'`
  - `ReviewSourceType`: `'RECALL'` (minimal; future modes reserved for future changes)
  - `ReviewOutcome`: immutable value object (not an entity, not a persisted table, not an event bus message)
- [x] 1.2 Implement pure state transition function `evaluateCardTransition(currentState, outcome)` with unit tests:
  - `NEW` + `PASS` → `LEARNING`
  - `NEW` + `FAIL` → `LEARNING`
  - `LEARNING` + `PASS` → `REVIEW`
  - `LEARNING` + `FAIL` → `LEARNING`
  - `REVIEW` + `PASS` → `MASTERED`
  - `REVIEW` + `FAIL` → `LEARNING`
  - `MASTERED` + `PASS` → `MASTERED`
  - `MASTERED` + `FAIL` → `REVIEW`
  - Invariant: State transition evaluated strictly as $f(\text{currentState}, \text{result})$, never derived from `repetitions >= N`.
- [x] 1.3 Implement counter calculation pure logic:
  - `repetitions`: `+1` on `PASS`, unchanged on `FAIL` (monotonic non-decreasing, lifetime volume, never resets).
  - `lapses`: `+1` on `FAIL` if current state is `REVIEW` or `MASTERED`, unchanged on `NEW` or `LEARNING` (monotonic non-decreasing, post-consolidation only).
- [x] 1.4 Implement progress status and percentage pure functions:
  - `calculateVariantProgressStatus(cards: LearningCard[])`:
    - `NOT_STARTED`: all cards `NEW`
    - `IN_PROGRESS`: at least 1 card moved out of `NEW`, but mastered < total
    - `MASTERED`: mastered === total (and total > 0)
  - `calculateVariantProgressPercent(masteredCount: number, totalCount: number)`:
    - `totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0` (unweighted derived metric, zero DB columns)

---

## Phase 2: Application Layer (Settlement Coordinator Port)
- [x] 2.1 Define `RecallSettlementCoordinator` port in `src/application/learning/recall-settlement-coordinator.ts`:
  - Input: `SettleRecallAttemptInput` (session, promptIndex, driverId, variantKey, cardKey, answer, expectedAnswer, outcome, durationMs, isLastPrompt, nextPromptSnapshot)
  - Output: `SettleRecallAttemptOutput` (attempt, card, progressStatus, session, isDuplicate)
- [x] 2.2 Wire `SubmitRecallAnswerUseCase` to delegate to `RecallSettlementCoordinator`:
  - Replace isolated attempt save with atomic `settleAttempt()`.
  - Maintain idempotent return behavior when `isDuplicate` is true.
  - Invariant: `LearningCard.nextReviewAt` is passed through untouched and never recalculated.

---

## Phase 3: Infrastructure Layer (Single Atomic Transaction & Outside-Tx P2002 Recovery)
- [x] 3.1 Implement `PrismaRecallSettlementCoordinator` in `src/infrastructure/learning/`:
  - Executes the 4 operational mutations inside a single `prisma.$transaction`:
    1. Insert `recall_attempt`
    2. Read `learning_card` and evaluate state transition
    3. Update `learning_card` (`state`, `repetitions`, `lapses`; leave `nextReviewAt` untouched)
    4. Calculate new `DriverVariantProgress.status` and update `driver_variant_progress`
    5. Advance `recall_session` cursor (`currentPromptIndex`, `status`, snapshot)
- [x] 3.2 Implement P2002 Recovery strictly outside failed transaction:
  - Wrap `$transaction` in a `try/catch`.
  - Check error: `error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`.
  - Verify constraint target matches `(sessionId, promptIndex)` (e.g. `sessionId_promptIndex`).
  - If unrelated constraint: rethrow immediately.
  - If target matches: transaction is already terminated and rolled back.
  - Execute a separate, fresh read query outside the failed transaction to fetch existing attempt, card, progress status, and session.
  - Return with `isDuplicate: true` without performing state transition, counter increments, or session cursor advance.

---

## Phase 4: Verification & Regression Testing (TDD Requirements)
- [x] 4.1 Unit tests for pure domain functions:
  - Verify every branch of the 4x2 state transition matrix.
  - Verify `repetitions` monotonicity and non-reset rules.
  - Verify `lapses` monotonicity (no increment during `NEW`/`LEARNING` failures, `+1` on `REVIEW`/`MASTERED` failures).
  - Verify `MASTERED + FAIL → REVIEW` recovery flow.
  - Verify unweighted progress percent calculation and status transitions.
- [x] 4.2 Integration tests for atomic settlement & rollback (Real PostgreSQL):
  - Verify complete three-stage traversal (`NEW` → `LEARNING` → `REVIEW` → `MASTERED`) with intermediate failures.
  - Verify atomic rollback: simulated failure during session advancement rolls back attempt creation and card updates.
  - Verify rollback allows subsequent retry to settle successfully.
  - Verify `nextReviewAt` remains completely unchanged across `PASS` and `FAIL`.
- [x] 4.3 Concurrency & Idempotency tests (Real PostgreSQL with `Promise.all`):
  - Scenario A: Concurrent submissions for the same `(sessionId, promptIndex)` result in exactly 1 attempt, 1 card state transition, and 1 counter increment.
  - Scenario B: Duplicate submission returns existing attempt without double-incrementing `repetitions` or `lapses`.
  - Scenario C: Duplicate submission does not advance session cursor twice.
  - Scenario D: Verify P2002 recovery executes successfully outside the aborted transaction block.
  - Scenario E: Unrelated unique constraint violations are rethrown and not swallowed as idempotent answers.
- [x] 4.4 Full regression test suite:
  - Execute all Change 01–05 test suites to confirm 100% backward compatibility (38 test files, 227 tests passing).
