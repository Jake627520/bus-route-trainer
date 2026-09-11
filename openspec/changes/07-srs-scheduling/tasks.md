# Tasks: 07-srs-scheduling

---

## Phase 1: Domain Specification & Scheduler Engine (TDD)
- [x] 1.1 Create `src/domain/srs/srs-interval-policy.ts`:
  - Define `SRS_INTERVAL_SECONDS` mapping levels 0..5 to seconds (`10m, 1d, 3d, 7d, 14d, 30d`).
  - Define `SrsLevel` type (`0 | 1 | 2 | 3 | 4 | 5`).
- [x] 1.2 Implement pure scheduler engine in `src/domain/srs/schedule-review.ts`:
  - `scheduleReview(card, outcome, now)`:
    - Pure, deterministic, clock-injected (`now: Date`).
    - Explicit PASS:
      - `NEW + PASS` → `LEARNING` + Level 1 (`now + 1d`).
      - `LEARNING + PASS` → `REVIEW` + Level 2 (`now + 3d`).
      - `REVIEW + PASS (L0..L3)` → `REVIEW` + Level $L+1$.
      - `REVIEW + PASS (L4)` → `MASTERED` + Level 5 (`now + 30d`).
      - `MASTERED + PASS (L5)` → `MASTERED` + Level 5 (`now + 30d`).
    - Defensive Scheduling on PASS: `max(existingNextReviewAt, now + interval(nextLevel))`.
    - Explicit FAIL (no `max`):
      - Reset to Level 0 (`now + 10m`).
      - `(NEW | LEARNING) + FAIL` → `LEARNING`, no lapse increment.
      - `(REVIEW | MASTERED) + FAIL` → `REVIEW`, `lapses + 1`.
    - Repetitions/Lapses: `reps + 1` on PASS; `lapses + 1` on FAIL for `REVIEW | MASTERED`.
  - `isCardDue(card, now)`:
    - Returns `card.nextReviewAt !== null && card.nextReviewAt.getTime() <= now.getTime()`.
- [x] 1.3 Write comprehensive unit test suite in `src/__tests__/domain/srs/schedule-review.test.ts`:
  - Test all 8 primary CardState × Outcome combinations, plus the required Level-specific and temporal edge cases.
  - Test Named Suite 1 (Lapse recovery):
    - `REVIEW/L4 + FAIL -> REVIEW/L0/10m`
    - `REVIEW/L0 + PASS -> REVIEW/L1/1d`
  - Test Named Suite 2 (MASTERED recovery):
    - `MASTERED/L5 + FAIL -> REVIEW/L0/10m`
    - `REVIEW/L0 + PASS -> REVIEW/L1/1d`
  - Test Named Suite 3 (Overdue PASS):
    - `existing = now - 10d`, `now = T`, `interval = 7d` -> `expected = T + 7d` (anchored to `now`).
  - Test Named Suite 4 (Early PASS with shorter vs longer interval):
    - `existing = now + 5d`, `target = now + 3d` -> `expected = now + 5d` (retains existing).
    - `existing = now + 5d`, `target = now + 7d` -> `expected = now + 7d` (extends to target).
  - Test FAIL immediate reset (does not use `max`).
  - Test Exact Due boundary (`<= now`, `now + 1ms`, `now - 1ms`, `null`).
  - Test Level limits (`0..5`) and strict invariants (`srsLevel === 5 <=> state === MASTERED`).
  - Test `repetitions` and `lapses` monotonicity.

---

## Phase 2: Schema & Database Migration
- [x] 2.1 Update `prisma/schema.prisma`:
  - Add `srsLevel Int @default(0) @map("srs_level")` to `LearningCard`.
  - Add index `@@index([progressId, nextReviewAt])`.
- [x] 2.2 Create and inspect Prisma migration:
  - Run `npx prisma migrate dev --name add_srs_level_and_due_index --create-only`.
  - Verify migration SQL: `ALTER TABLE "learning_card" ADD COLUMN "srs_level" INTEGER NOT NULL DEFAULT 0;` and `CREATE INDEX ... ON "learning_card"("progressId", "nextReviewAt");`.
  - Apply migration and verify on PostgreSQL.

---

## Phase 3: Application Port & Coordinator Integration
- [x] 3.1 Define `DueLearningCardsQueryPort` in `src/application/learning/due-learning-cards-query-port.ts`:
  - Input: `driverId`, `variantKey`, `now: Date`, `limit?: number`.
  - Output: `LearningCard[]` where `nextReviewAt <= now`, ordered deterministically by `nextReviewAt ASC, id ASC`.
- [x] 3.2 Update `RecallSettlementCoordinator` port:
  - Include `srsLevel` and updated `nextReviewAt` in settlement output.
- [x] 3.3 Update `PrismaRecallSettlementCoordinator`:
  - Injected `Clock` port to eliminate unbounded `new Date()`.
  - Pessimistic row locking via `SELECT ... FOR UPDATE` ensuring serialized valid events.
  - Delegate scheduling calculation to `scheduleReview(card, outcome, now)`.
  - Persist `srsLevel` and `nextReviewAt` inside the single atomic transaction.

---

## Phase 4: Infrastructure Implementation & Integration Tests
- [x] 4.1 Implement `PrismaDueLearningCardsRepository`:
  - Two-stage query:
    1. Look up `DriverVariantProgress` by `(driverId, variantKey)` unique key to retrieve `progressId`.
    2. Query `learning_card` where `progressId = ? AND nextReviewAt <= now` ordered by `nextReviewAt ASC, id ASC`.
  - Return empty array if progress does not exist.
  - Limit semantics: undefined -> all; <= 0 -> []; positive -> limit.
  - Complete domain mapping including srsLevel.
- [x] 4.2 Write integration tests in `src/__tests__/infrastructure/srs/prisma-due-learning-cards-repository.test.ts`:
  - Test finding due cards vs future cards vs null cards.
  - Test boundary at exact milliseconds.
  - Test deterministic ordering with tie-breaker `id ASC` for identical timestamps.
  - Test limit semantics (positive, undefined, 0, negative).
  - Test non-existent enrollment returns `[]`.
  - Test complete domain mapping including srsLevel.
- [x] 4.3 Update `recall-settlement-coordinator.test.ts`:
  - Verify `srsLevel` and `nextReviewAt` are updated atomically on real PostgreSQL.
  - Verify rollback on failure reverts both `srsLevel` and `nextReviewAt`.

---

## Phase 5: Review Queue & Recall Session Selection Policy (Domain & TDD)
- [x] 5.1 Implement `src/domain/learning/recall-queue-policy.ts`:
  - Define `RecallQueueCandidate`, `RecallQueuePolicyInput`, `RecallQueuePolicyResult`.
  - Constants: `DEFAULT_SESSION_SIZE = 15`, `MAX_SESSION_SIZE = 20`, `DEFAULT_DUE_RATIO = 0.7`.
  - Pure function `selectRecallQueue(input)`:
    - Exclude cards in `excludedCardIds`.
    - Sort DUE pool: oldest `nextReviewAt` first (overdue duration DESC), tie-breaker `cardId ASC`.
    - Sort NEW pool: deterministic `cardId ASC`.
    - Target calculation: `dueTarget = Math.ceil(sessionSize * dueRatio)`, `newTarget = sessionSize - dueTarget`.
    - Asymmetric dynamic backfill between DUE and NEW pools.
    - Clamping: `result.length <= min(sessionSize, MAX_SESSION_SIZE)`.
    - Invariant: Zero duplicate card IDs in output.
- [x] 5.2 Implement `src/domain/learning/recall-session-plan.ts`:
  - Immutable domain entity `RecallSessionPlan` (`sessionId`, `cardIds`, `createdAt`).
  - Enforce non-empty and non-duplicate validations.
  - Defensively copy/freeze inputs; no system clock access.
- [x] 5.3 Write unit tests in `src/__tests__/domain/learning/recall-queue-policy.test.ts`:
  - Test 1: DUE preferred over NEW up to target ratio.
  - Test 2: Default 70/30 target mix.
  - Test 3: DUE shortage filled by NEW.
  - Test 4: NEW shortage filled by DUE.
  - Test 5: Both pools insufficient returns all available.
  - Test 6: Session size respected (e.g. 15).
  - Test 7: Maximum session size respected (capped at 20).
  - Test 8: Session size <= 0 returns empty array.
  - Test 9: Excluded cards removed from candidates.
  - Test 10: Duplicate candidate IDs in input never produce duplicates in output.
  - Test 11: Oldest overdue DUE cards selected first.
  - Test 12: Equal nextReviewAt uses cardId ASC tie-breaker.
  - Test 13: NEW cards ordered deterministically by cardId ASC.
  - Test 14: Exact due boundary (nextReviewAt <= now) accepted; future cards filtered out.
  - Test 15: Supplied now is respected; no internal system-clock access.
- [x] 5.4 Write unit tests in `src/__tests__/domain/learning/recall-session-plan.test.ts`:
  - Test 16: Session snapshot preserves card order.
  - Test 17: Session snapshot rejects duplicate card IDs.
  - Test 18: Empty session is rejected with descriptive error.
  - Test 19: Defensively clones createdAt and freezes cardIds array.

---

## Phase 6: Recall Session Selection Application Use Case & Port Composition
- [x] 6.1 Enhance `RecallQueuePolicyResult` in `src/domain/learning/recall-queue-policy.ts`:
  - Add `selectedDueCount`, `selectedNewCount`, `eligibleDueCount`, `eligibleNewCount`.
  - Authoritatively track and return pool metrics from pure domain policy.
- [x] 6.2 Declare `NewLearningCardsQueryPort` in `src/application/learning/new-learning-cards-query-port.ts`:
  - `findNewCards(params: FindNewCardsParams): Promise<LearningCard[]>`.
- [x] 6.3 Implement `PlanRecallSessionUseCase` in `src/application/learning/plan-recall-session-use-case.ts`:
  - Pure application orchestrator injecting `Clock`, `DueLearningCardsQueryPort`, `NewLearningCardsQueryPort`.
  - Unbounded candidate queries to prevent starvation; pure delegation to `selectRecallQueue`.
  - Return `{ plan: RecallSessionPlan | null, selectedDueCount, selectedNewCount, totalEligibleCount }`.
- [x] 6.4 Implement `PrismaNewLearningCardsRepository` in `src/infrastructure/learning/prisma-new-learning-cards-repository.ts`:
  - Query `state: CardState.NEW` and `nextReviewAt: null` ordered by `id ASC`.
- [x] 6.5 Write tests in `src/__tests__/application/learning/plan-recall-session-use-case.test.ts`:
  - 14 tests covering mixed composition, shortages, anti-starvation, backfill, exclusion, parameter clamping, and Clock injection.
- [x] 6.6 Write tests in `src/__tests__/infrastructure/srs/prisma-new-learning-cards-repository.test.ts`:
  - 4 integration tests verifying NEW state filtering, review exclusion, non-enrollment, and limit.

---

## Phase 7: Final Verification & Regression
- [ ] 7.1 Run full regression suite (`npm test -- --run`).
- [ ] 7.2 ESLint & Build check (`npm run lint`, `npm run build`).
- [ ] 7.3 OpenSpec validation (`openspec validate 07-srs-scheduling`, `openspec doctor`).
- [ ] 7.4 Git scope and diff audit.
