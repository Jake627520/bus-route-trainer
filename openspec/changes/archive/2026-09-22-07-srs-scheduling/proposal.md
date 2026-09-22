# Proposal: 07-srs-scheduling

## Why
In Change 04, the foundation of `LearningCard` was introduced with `state`, `repetitions`, `lapses`, and an unmanaged `nextReviewAt` timestamp. In Change 06, atomic settlement and card state transitions were implemented, but `nextReviewAt` was deliberately kept untouched to isolate concerns.

To transform the recall mechanism into a full Spaced Repetition System (SRS) for bus drivers, the system requires a deterministic, robust scheduling policy that:
1. Calculates precise future review times (`nextReviewAt`) based on recall outcomes and progressive retention ladders.
2. Decouples **Mastery State** (`CardState`) from **Scheduling Ladder Position** (`srsLevel`), preventing state compression or artificial coupling with lifetime repetition counters.
3. Implements defensive scheduling semantics:
   - Early successful reviews do not prematurely compress scheduled dates (`max(existingNextReviewAt, now + interval)`).
   - Failures trigger an immediate reset to Level 0 (10 minutes) to rapidly restore memory stability.
4. Provides an application query port and persistence implementation to identify **Due Learning Cards** (`nextReviewAt <= now`) without loading unnecessary domain state.

## What Changes
- **Database Schema**: Add `srsLevel Int @default(0) @map("srs_level")` to `LearningCard` with a backward-compatible Prisma migration and verify no blocking operations for the deployment target.
- **Domain Layer**:
  - Define `SrsIntervalPolicy`: Constant ladder `[10m, 1d, 3d, 7d, 14d, 30d]` (Levels 0..5).
  - Implement pure scheduler function `scheduleReview(card, outcome, now)`:
    - Pure, deterministic, clock-injected (`now: Date`).
    - Explicit Progression:
      - `NEW + PASS` → `LEARNING` + Level 1 (`now + 1d`).
      - `LEARNING + PASS` → `REVIEW` + Level 2 (`now + 3d`).
      - `REVIEW + PASS` → `min(srsLevel + 1, 5)` (Level 5 reaches `MASTERED`).
      - `MASTERED + PASS` → `MASTERED` + Level 5 (`30d`).
    - Defensive Scheduling on PASS: `max(existingNextReviewAt, now + interval(nextLevel))`.
    - Overdue Anchoring: If `existingNextReviewAt < now`, PASS is anchored to `now` (`now + interval(nextLevel)`), never from the past overdue date.
    - Explicit FAIL (no `max`):
      - Reset to Level 0 (`now + 10m`).
      - `(NEW | LEARNING) + FAIL` → `LEARNING`, no lapse increment.
      - `(REVIEW | MASTERED) + FAIL` → `REVIEW`, `lapses + 1`.
    - Due Predicate: `isCardDue(card, now) <=> card.nextReviewAt !== null && card.nextReviewAt <= now`.
    - Domain Invariants:
      - `srsLevel === 5 <=> state === MASTERED`.
      - `state === NEW <=> nextReviewAt === null`.
      - `state !== NEW <=> nextReviewAt !== null`.
- **Application Layer**:
  - Define `DueLearningCardsQueryPort`: Query due cards for a given driver and variant, ordered deterministically by `nextReviewAt ASC, id ASC`.
  - Update `RecallSettlementCoordinator` / Settlement use case to persist updated `srsLevel` and `nextReviewAt` atomically.
- **Infrastructure Layer**:
  - Update `PrismaRecallSettlementCoordinator` to persist `srsLevel` and `nextReviewAt` within the single atomic transaction.
  - Implement `PrismaDueLearningCardsRepository` fulfilling `DueLearningCardsQueryPort` using the two-stage access path:
    1. Resolve `progressId` via `DriverVariantProgress` `(driverId, targetVariantKey)` unique key.
    2. Range query `LearningCard` with `WHERE progressId = ? AND nextReviewAt <= ? ORDER BY nextReviewAt ASC, id ASC`.
- **Verification**:
  - Full matrix unit tests for all (State × Level × Result) permutations.
  - Exact boundary tests (`now`, `now + 1ms`, `now - 1ms`).
  - Full backward compatibility and PostgreSQL integration tests.
