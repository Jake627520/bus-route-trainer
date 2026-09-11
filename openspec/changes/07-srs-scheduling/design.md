# Design: 07-srs-scheduling

## 1. Architecture Overview & Principles
Change 07 establishes the Spaced Repetition System (SRS) scheduling engine for bus route memory consolidation.

Key architectural tenets:
1. **Deterministic Execution**: Given `(card, outcome, now)`, the result `(nextState, nextSrsLevel, nextReviewAt, repetitions, lapses)` is 100% mathematically deterministic. No random fuzzing, no floating-point ease factors, no machine-learning heuristics.
2. **Decoupled Orthogonal Fields**:
   - `state` (`CardState`): Driver route mastery stage (`NEW | LEARNING | REVIEW | MASTERED`).
   - `srsLevel` (`Int`, `0..5`): Discrete scheduling interval index.
   - `repetitions` (`Int`): Lifetime successful recall count (monotonic non-decreasing, never resets).
   - `lapses` (`Int`): Lifetime post-consolidation failures count (monotonic non-decreasing, never resets).
   - `nextReviewAt` (`DateTime?`): Scheduled UTC review timestamp.
3. **Injected Time (Clock Port)**: Pure domain functions accept `now: Date`. No internal `new Date()`.
4. **Defensive Scheduling**: Early reviews preserve future scheduled review dates via `max(existingNextReviewAt, now + interval)`.

---

## 2. Interval Policy & Constants
Discrete 6-level ladder configured in `src/domain/srs/srs-interval-policy.ts`:

```typescript
export const SRS_INTERVAL_SECONDS = {
  0: 10 * 60,              // Level 0: 10 minutes (Again / Lapse)
  1: 1 * 24 * 60 * 60,     // Level 1: 1 day
  2: 3 * 24 * 60 * 60,     // Level 2: 3 days
  3: 7 * 24 * 60 * 60,     // Level 3: 7 days
  4: 14 * 24 * 60 * 60,    // Level 4: 14 days
  5: 30 * 24 * 60 * 60,    // Level 5: 30 days (Mature / Mastered)
} as const;

export type SrsLevel = 0 | 1 | 2 | 3 | 4 | 5;
```

---

## 3. Transition Matrix, Invariants & Scheduling Rules

### 3.1 Strict Domain Invariants
1. **Bounded Level**: $0 \le \text{srsLevel} \le 5$.
2. **Mastery Equivalence**: $\text{state} = \text{MASTERED} \iff \text{srsLevel} = 5$.
3. **Scheduled Timestamp Existence**:
   - $\text{state} = \text{NEW} \iff \text{nextReviewAt} = \text{null}$.
   - $\text{state} \neq \text{NEW} \iff \text{nextReviewAt} \neq \text{null}$.
4. **Counter Monotonicity**:
   - $\text{repetitions}$ is lifetime PASS volume; monotonically non-decreasing ($\Delta \ge 0$). Never resets on FAIL or Lapse.
   - $\text{lapses}$ is post-consolidation FAIL volume; monotonically non-decreasing ($\Delta \ge 0$). Never increments on `NEW` or `LEARNING` failures.
5. **No Implicit Equality**: $\text{srsLevel}$ is NEVER derived from $\text{repetitions}$. A card with $\text{repetitions} = 20$ can have $\text{srsLevel} = 0$ after a lapse.

### 3.2 Explicit Transitions on PASS
- **Level & State Progression**:
  - `NEW + PASS` $\implies$ `state = LEARNING`, `srsLevel = 1` ($\Delta = +1$), $\text{nextReviewAt} = \text{now} + 1\text{d}$.
  - `LEARNING + PASS` $\implies$ `state = REVIEW`, `srsLevel = 2` ($\Delta = +1$), $\text{nextReviewAt} = \max(\text{existing}, \text{now} + 3\text{d})$.
  - `REVIEW + PASS (L0)` $\implies$ `state = REVIEW`, `srsLevel = 1`, $\text{nextReviewAt} = \max(\text{existing}, \text{now} + 1\text{d})$.
  - `REVIEW + PASS (L1)` $\implies$ `state = REVIEW`, `srsLevel = 2`, $\text{nextReviewAt} = \max(\text{existing}, \text{now} + 3\text{d})$.
  - `REVIEW + PASS (L2)` $\implies$ `state = REVIEW`, `srsLevel = 3`, $\text{nextReviewAt} = \max(\text{existing}, \text{now} + 7\text{d})$.
  - `REVIEW + PASS (L3)` $\implies$ `state = REVIEW`, `srsLevel = 4`, $\text{nextReviewAt} = \max(\text{existing}, \text{now} + 14\text{d})$.
  - `REVIEW + PASS (L4)` $\implies$ `state = MASTERED`, `srsLevel = 5`, $\text{nextReviewAt} = \max(\text{existing}, \text{now} + 30\text{d})$.
  - `MASTERED + PASS (L5)` $\implies$ `state = MASTERED`, `srsLevel = 5` (capped), $\text{nextReviewAt} = \max(\text{existing}, \text{now} + 30\text{d})$.
- **Scheduling Calculation**:
  $$\text{targetDate} = \text{now} + \text{Interval}(\text{nextLevel})$$
  $$\text{nextReviewAt} = \text{existingNextReviewAt} \neq \text{null} \;?\; \max(\text{existingNextReviewAt},\, \text{targetDate}) : \text{targetDate}$$
- **Overdue Anchoring Principle**:
  If $\text{existingNextReviewAt} < \text{now}$ (overdue review), $\max(\text{existingNextReviewAt},\, \text{now} + \text{interval}) = \text{now} + \text{interval}$. Thus, PASS scheduling is **always anchored to the injected `now`**, never compounding on an overdue timestamp in the past.
- **Counters**:
  - $\text{repetitions} = \text{repetitions} + 1$
  - $\text{lapses} = \text{lapses}$ (unchanged)

### 3.3 Explicit Transitions on FAIL (Immediate Reset)
- **Level Reset**:
  $$\text{nextLevel} = 0$$
- **Mastery State Transition**:
  - `NEW + FAIL` $\implies$ `state = LEARNING`, `srsLevel = 0`, `nextReviewAt = now + 10m`, `lapses` unchanged.
  - `LEARNING + FAIL` $\implies$ `state = LEARNING`, `srsLevel = 0`, `nextReviewAt = now + 10m`, `lapses` unchanged.
  - `REVIEW + FAIL` $\implies$ `state = REVIEW`, `srsLevel = 0`, `nextReviewAt = now + 10m`, `lapses = lapses + 1`.
  - `MASTERED + FAIL` $\implies$ `state = REVIEW`, `srsLevel = 0`, `nextReviewAt = now + 10m`, `lapses = lapses + 1`.
- **Scheduling Calculation**:
  $$\text{nextReviewAt} = \text{now} + \text{Interval}(0) \quad (\text{now} + 10\text{ minutes})$$
  *(Invariant: FAIL strictly forbids the use of `max()`. It enforces an immediate 10-minute wake-up, regardless of any future scheduled dates).*
- **Counters**:
  - $\text{repetitions} = \text{repetitions}$ (unchanged)
  - $\text{lapses}$: increments if and only if prior state was `REVIEW` or `MASTERED`.

---

## 4. Due Predicate & Boundary Semantics

A card is considered **Due** for spaced review if and only if:
```typescript
export function isCardDue(card: { nextReviewAt: Date | null }, now: Date): boolean {
  if (!card.nextReviewAt) return false;
  return card.nextReviewAt.getTime() <= now.getTime();
}
```

### Boundary Guarantees:
- `card.nextReviewAt === null` (`NEW` card) $\to$ `false` (Not an SRS Due card; new cards are queued via Session Strategy).
- `card.nextReviewAt.getTime() === now.getTime()` $\to$ `true` (`<= now`).
- `card.nextReviewAt.getTime() === now.getTime() + 1` $\to$ `false` (Future card).
- `card.nextReviewAt.getTime() === now.getTime() - 1` $\to$ `true` (Overdue card).

---

## 5. Persistence & Schema Migration

### 5.1 Prisma Schema Delta
In `prisma/schema.prisma`:
```prisma
model LearningCard {
  id           String                @id @default(uuid())
  progressId   String
  cardKey      String
  cardType     CardType
  state        CardState             @default(NEW)
  srsLevel     Int                   @default(0) @map("srs_level")
  nextReviewAt DateTime?
  repetitions  Int                   @default(0)
  lapses       Int                   @default(0)
  progress     DriverVariantProgress @relation(fields: [progressId], references: [id], onDelete: Cascade)

  @@unique([progressId, cardKey])
  @@index([progressId, cardType])
  @@index([progressId, nextReviewAt])
  @@map("learning_card")
}
```

### 5.2 Two-Stage Access Path & Indexing Strategy
The physical relational model intentionally respects the Domain Aggregate boundary:
1. `DriverVariantProgress` owns `driverId` and `targetVariantKey`, with `@@unique([driverId, targetVariantKey])`.
   - Access Path 1: Resolves `(driverId, variantKey) -> progressId` in $O(1)$ unique index lookup.
2. `LearningCard` is a child entity referencing parent progress via `progressId`.
   - Access Path 2: `@@index([progressId, nextReviewAt])` enables efficient range filtering (`WHERE progressId = ? AND nextReviewAt <= ?`) and index-supported sorting (`ORDER BY nextReviewAt ASC`).
- **Migration Properties**:
  - `srs_level INT NOT NULL DEFAULT 0`: Constant default in PostgreSQL 11+ is metadata-only without full table rewrite.
  - `@@index([progressId, nextReviewAt])`: Composite B-tree index aligning directly with the two-stage range query access pattern.
  - Deployment verification: Verify generated PostgreSQL DDL does not require table rewrite or unacceptable blocking operations.

---

## 6. Ports & Coordinates

### 6.1 Application Port
```typescript
export interface DueLearningCardsQueryPort {
  findDueCards(params: {
    driverId: string;
    variantKey: string;
    now: Date;
    limit?: number;
  }): Promise<LearningCard[]>;
}
```

### 6.2 Deterministic Ordering & Two-Stage Implementation Contract
Infrastructure implementation (`PrismaDueLearningCardsRepository`) must execute:
1. Resolve `progressId`:
   ```sql
   SELECT id FROM driver_variant_progress 
   WHERE "driverId" = $1 AND "targetVariantKey" = $2;
   ```
2. Range query with deterministic tie-breaker (`nextReviewAt ASC, id ASC`):
   ```sql
   SELECT * FROM learning_card 
   WHERE "progressId" = $1 AND "nextReviewAt" <= $2
   ORDER BY "nextReviewAt" ASC, "id" ASC
   LIMIT $3;
   ```
   *Note: Tie-breaker on `id ASC` ensures deterministic ordering and reproducible session selection when multiple cards share identical timestamps.*

### 6.3 Settlement Coordinator Integration
`PrismaRecallSettlementCoordinator` atomically updates:
1. `srsLevel`
2. `nextReviewAt`
3. `state`
4. `repetitions`
5. `lapses`
alongside `RecallAttempt`, `DriverVariantProgress.status`, and `RecallSession` cursor in the existing single transaction.

---

## 7. Review Queue & Recall Session Selection Policy (Phase 5)

### 7.1 Selection Engine Objectives & Product Scenario
Construct an optimized, deterministic Recall Session of 10–20 cards tailored for a Queensland bus driver's 5–10 minute pre-shift memory consolidation window.

### 7.2 Candidate Pools
- **DUE Pool**:
  - `card.nextReviewAt !== null && card.nextReviewAt <= now`.
  - Ordered deterministically:
    1. Overdue duration DESC (i.e. `nextReviewAt ASC`).
    2. Tie-breaker: `cardId ASC`.
- **NEW Pool**:
  - `card.state === CardState.NEW && card.nextReviewAt === null`.
  - Ordered deterministically: `cardId ASC`.
- **Intra-session Duplicate Prevention (Session-level Exclusion vs. SRS Time Cooldown)**:
  - **SRS Layer**: `nextReviewAt` 負責時間冷卻與到期判定（FAIL 後由 SRS `scheduleReview` 設定 `nextReviewAt = now + 10m`；未到期卡片自然不落入 DUE pool）。
  - **Session Layer**: `excludedCardIds: ReadonlySet<string>` 僅負責防止當次 Session 重複出題（session-level exclusion），排除已在當次 Session 出現過的卡片。`RecallQueuePolicy` 不維護也不感知冷卻時間戳。
  - Cards specified in `excludedCardIds` are strictly excluded from both DUE and NEW pools.
  - Final card sequence contains zero duplicate card IDs.

### 7.3 Target Mixing Ratio & Dynamic Backfill
- Default session size: `DEFAULT_SESSION_SIZE = 15`. Max session size: `MAX_SESSION_SIZE = 20`.
- Target ratio: `DEFAULT_DUE_RATIO = 0.7` (70% DUE, 30% NEW).
- Targets:
  - `dueTarget = Math.ceil(sessionSize * dueRatio)`
  - `newTarget = sessionSize - dueTarget`
- Asymmetric dynamic backfill:
  - If DUE cards are insufficient, available NEW cards fill the remaining deficit up to `sessionSize`.
  - If NEW cards are insufficient, available DUE cards fill the remaining deficit up to `sessionSize`.
  - If both pools combined are insufficient, return all available non-excluded cards.
  - Clamping: `selected.length <= min(sessionSize, MAX_SESSION_SIZE)`.

### 7.4 Immutable Session Plan Snapshot
- `RecallSessionPlan`:
  - `sessionId: string`
  - `cardIds: readonly string[]` (frozen snapshot)
  - `createdAt: Date` (cloned defensively)
- Guarantees:
  - Non-empty validation (`cardIds.length > 0`).
  - Strict uniqueness validation (no duplicate card IDs).
  - Snapshot immutability: session sequence is fixed at creation time; SRS mutations during review do not reshuffle the in-progress session plan.
