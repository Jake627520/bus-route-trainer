# Design: 05-recall-session-domain

## 1. Domain Architecture & Boundaries

```text
                  GTFS Read Model (Change 03)
                           │
                           ▼
                      RouteVariant
                           │
                           ▼
               DriverVariantProgress (Change 04)
                           │
                           ▼
                      LearningCard (Change 04)
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
  RecallSession (Change 05)            PromptSelectionStrategy
       │                                       │
       └───────────────────┬───────────────────┘
                           ▼
                      RecallPrompt (Transient Projection)
                           │
                           ▼
                      DriverAnswer
                           │
                           ▼
                 DeterministicEvaluator
                           │
                           ▼
                     RecallOutcome (PASS / FAIL)
                           │
                           ▼
                     RecallAttempt (Telemetry)
                           │
                           ▼
                 [Future SRS / Analytics: Change 06+]
```

---

## 2. Architecture Decision Records (ADRs)

### ADR-01: Why `LearningCard` Does Not Equal `RecallPrompt`
- **Context**: A common anti-pattern in flashcard applications is coupling the card entity directly to a question format (e.g., storing "What is the stop after King George Square?" inside the card).
- **Decision**: `LearningCard` represents *what* to memorize (a stable topological relationship anchored to `stopId` or `(fromStopId, toStopId)`). `RecallPrompt` represents *how* to challenge the driver during a training session.
- **Consequence**: The same `NEXT_STOP::stop_1->stop_2` card can yield a forward adjacency recall challenge in Change 05, and in the future yield a timing question, hazard challenge, or reverse inspection prompt without altering the underlying learning card identity.

### ADR-02: Why `RecallPrompt` Is Not Persisted as a Table
- **Context**: Persisting prompts requires a dedicated database table, migration overhead, row lifecycle tracking, and complex cascade handling.
- **Decision**: `RecallPrompt` is a transient domain projection. Rather than creating a separate table, `RecallSession` itself stores the active prompt snapshot fields directly on the session record (`currentPromptIndex`, `currentCardKey`, `currentRecallMode`, `currentExpectedAnswer`, `currentPromptStartedAt`).
- **Consequence**: Zero database bloat. The active prompt snapshot is fully durable and persistent without the architectural baggage of a separate prompt entity.

### ADR-03: Why `expectedAnswer` Must Be Snapshotted at Prompt Generation Time
- **Context**: If a prompt is generated, and before the driver submits their answer the underlying GTFS schedule is updated or deleted, re-evaluating against live GTFS could retroactively mark a previously correct response as incorrect or throw an error.
- **Decision**: When `RecallPrompt` is generated or cursor advances, `RecallSession` captures an immutable snapshot of `expectedAnswer` (the target `stopId` or normalized stop name) along with `currentRecallMode` and `currentPromptStartedAt`. Re-reading the prompt via `GetCurrentRecallPrompt` returns this stored snapshot without re-querying GTFS.
- **Consequence**: Evaluation is strictly performed against the session's prompt snapshot. A training attempt's validity and grading integrity are 100% immune to concurrent schedule updates or feed removals.

### ADR-04: How to Prevent Concurrent Active Sessions
- **Context**: If a driver opens multiple tabs or triggers rapid concurrent clicks, two requests could execute `findActiveSession()`, find none, and insert two active sessions for the same route variant.
- **Decision**: At the database level, enforce a PostgreSQL Partial Unique Index:
  ```sql
  CREATE UNIQUE INDEX "uidx_recall_session_active"
  ON "recall_session"("driverId", "targetVariantKey")
  WHERE "status" = 'IN_PROGRESS';
  ```
- **Consequence**: The second concurrent insert triggers Prisma `P2002`. The application layer inspects error metadata to ensure the collision specifically originates from `uidx_recall_session_active` (or model `RecallSession`), resolving idempotently to the winning active session. All unrelated P2002 errors are strictly rethrown.

### ADR-05: Why `PASS` / `FAIL` Binary Evaluation Is Sufficient (No `PARTIAL`)
- **Context**: Complex quiz systems often support partial credit, confidence weighting, or fractional grading.
- **Decision**: Change 05 supports only single-step recall (`NEXT_STOP_FORWARD` and `STOP_NAME_RECOGNITION`). A driver either correctly identifies the target stop or does not.
- **Consequence**: Deterministic, unambiguous grading. If multi-stop chain scoring or partial credit is introduced in a future release, it will be added with its own mathematical specification.

### ADR-06: Why Distractors / Multiple Choice Do Not Belong in Change 05
- **Context**: Generating 3 incorrect choices alongside 1 correct choice turns the engine into a multiple-choice quiz system.
- **Decision**: Change 05 is a *Recall Domain*, not a *Quiz Presentation Engine*. True route mastery requires active retrieval ("What is next?"), not passive recognition among 4 options.
- **Consequence**: No distractor generation algorithms, no random sampling from other routes, and no UI option array schemas in Change 05.

### ADR-07: Why `SequentialTopologyPromptStrategy` Is a Strategy Pattern
- **Context**: If sequential traversal is hardcoded directly inside `RecallSession.next()`, the aggregate must be refactored when SRS due-date ordering or weak-card prioritization is implemented.
- **Decision**: Define `PromptSelectionStrategy` as an interchangeable application port. Change 05 implements `SequentialTopologyPromptStrategy`.
- **Consequence**: Future scheduling algorithms (`SRS_DUE`, `WEAK_FIRST`) can be plugged in without modifying the `RecallSession` entity.

### ADR-08: How Session Behaves When GTFS Topology Updates or Deletes
- **Context**: GTFS updates or removals may occur during an ongoing training session.
- **Decision**:
  - `RecallSession` stores `targetVariantKey` as a string reference, completely independent of GTFS foreign keys.
  - If a variant can no longer be resolved in GTFS during an active session, already generated prompts evaluate against their snapshot; any subsequent prompt generation gracefully marks the session as unresolvable or completed without deleting historical records.
- **Consequence**: Zero data loss, zero foreign key constraint violations, and complete audit trail preservation.

### ADR-09: How `RecallAttempt` Decouples from Future SRS
- **Context**: Tying attempt logging directly to FSRS or SM-2 formulas creates a rigid, coupled monolith.
- **Decision**: `RecallAttempt` is an immutable telemetry record capturing raw operational data (`durationMs`, `outcome`, `startedAt`, `answeredAt`, `cardKey`).
- **Consequence**: Future SRS algorithms (Change 06+) can consume the stream of `RecallAttempt` records to update card stability, difficulty, and review intervals asynchronously without altering the session runtime.

### ADR-10: Why Change 05 Creates Zero Foreign Keys to GTFS Tables
- **Context**: Adding database foreign keys from `recall_session` or `recall_attempt` to `GtfsRoute` or `GtfsStop` would prevent GTFS re-imports or feed deletions from succeeding.
- **Decision**: Keep `routeId`, `stopId`, and `targetVariantKey` as application-level strings in `recall_session` and `recall_attempt`.
- **Consequence**: GTFS data remains an ephemeral, refreshable read model; driver training history remains a permanent, durable business asset.

### ADR-11: 0-Based `promptIndex` & Transactional Idempotency
- **Context**: Race conditions between repeated network submissions, cursor progression, and session completion could lead to skipped prompts or duplicate attempt rows.
- **Decision**:
  - `promptIndex` is strictly zero-based (0 to $M - 1$).
  - `SubmitRecallAnswer` executes within a single database transaction: validates session is `IN_PROGRESS`, records `RecallAttempt(sessionId, promptIndex)`, advances `currentPromptIndex`, and updates the active prompt snapshot fields (or sets `COMPLETED` and clears snapshot).
  - Attempt uniqueness is enforced at the database level by `@@unique([sessionId, promptIndex])`.
- **Consequence**: Guaranteed atomicity and rollback; concurrent or repeated submissions for the same prompt index safely return the recorded result without duplicate attempt creation.

---

## 3. Domain Model Specification

### 3.1 Entities & Enums

#### `SessionStatus`
```typescript
export enum SessionStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}
```

#### `RecallMode`
```typescript
export enum RecallMode {
  NEXT_STOP_FORWARD = 'NEXT_STOP_FORWARD',
  STOP_NAME_RECOGNITION = 'STOP_NAME_RECOGNITION',
}
```

#### `RecallOutcome`
```typescript
export enum RecallOutcome {
  PASS = 'PASS',
  FAIL = 'FAIL',
}
```

#### `RecallSession`
```typescript
export interface RecallSessionProps {
  id: string;
  driverId: string;
  routeId: string;
  targetVariantKey: string;
  status: SessionStatus;
  currentPromptIndex: number;
  currentCardKey: string | null;
  currentRecallMode: RecallMode | null;
  currentExpectedAnswer: string | null;
  currentPromptStartedAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  abandonedAt: Date | null;
}

export class RecallSession {
  // Aggregate root managing session lifecycle
  // Initial state on creation: IN_PROGRESS
  // Valid transitions:
  // IN_PROGRESS -> COMPLETED (automatic upon strategy completion or explicit finalization)
  // IN_PROGRESS -> ABANDONED (explicit user/system forfeit)
  // Terminal states (COMPLETED, ABANDONED) throw on mutation
}
```

#### `RecallPrompt` (Transient Projection)
```typescript
export interface RecallPrompt {
  promptId: string;
  sessionId: string;
  cardKey: string;
  promptIndex: number;
  recallMode: RecallMode;
  givenReference: string; // e.g., current station name/id
  expectedAnswer: string; // Immutable snapshot: target stopId or normalized name
  createdAt: Date;
}
```

#### `RecallAttempt` (Telemetry Entity)
```typescript
export interface RecallAttemptProps {
  id: string;
  sessionId: string;
  promptIndex: number; // Idempotent 1:1 anchor matching session prompt index
  cardKey: string; // Immutable historical semantic snapshot scoped by owning RecallSession's targetVariantKey
  recallMode: RecallMode;
  rawInput: string;
  expectedAnswer: string; // Exact stopId for NEXT_STOP_FORWARD; pre-normalized string for STOP_NAME_RECOGNITION
  outcome: RecallOutcome;
  startedAt: Date;
  answeredAt: Date;
  durationMs: number; // Server-calculated: answeredAt.getTime() - startedAt.getTime()
}
```

---

## 4. Normalization Pipeline

For text-based answers in `STOP_NAME_RECOGNITION`:
```typescript
export function normalizeStopName(input: string): string {
  return input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
```

Rules:
- Standardizes full-width and half-width characters via Unicode NFKC.
- Strips leading and trailing whitespace.
- Normalizes all letters to lowercase.
- Collapses multiple whitespace characters or tabs into a single ASCII space.
- Exact string equality (`===`) is performed on normalized values. No fuzzy matching or character transposition tolerances.
- **Evaluation Disambiguation**: Normalized stop names are evaluation comparison values, not unique stop identifiers. Target stops are strictly disambiguated by canonical `stopId`.

---

## 5. Strategy Pattern: `PromptSelectionStrategy`

```typescript
export interface PromptSelectionStrategy {
  selectNextPrompt(
    session: RecallSession,
    cards: LearningCard[],
    topology: RouteVariantDto | null
  ): RecallPrompt | null;
}
```

### `SequentialTopologyPromptStrategy`
- Orders cards by their topology projection sequence.
- **Boundary Rule**: For a route variant with N stops, exactly N - 1 `NEXT_STOP_FORWARD` prompts are produced (`max(N - 1, 0)`). The terminus stop has no following stop and generates zero forward prompts.
- Yields the prompt corresponding to `session.currentPromptIndex`.
- Returns `null` when `currentPromptIndex >= totalPrompts`, signaling session completion.

---

## 6. Persistence Schema (Prisma)

```prisma
enum SessionStatus {
  IN_PROGRESS
  COMPLETED
  ABANDONED
}

enum RecallMode {
  NEXT_STOP_FORWARD
  STOP_NAME_RECOGNITION
}

enum RecallOutcome {
  PASS
  FAIL
}

model RecallSession {
  id                     String          @id @default(uuid())
  driverId               String
  routeId                String
  targetVariantKey       String
  status                 SessionStatus   @default(IN_PROGRESS)
  currentPromptIndex     Int             @default(0)
  currentCardKey         String?
  currentRecallMode      RecallMode?
  currentExpectedAnswer  String?
  currentPromptStartedAt DateTime?
  startedAt              DateTime        @default(now())
  completedAt            DateTime?
  abandonedAt            DateTime?
  attempts               RecallAttempt[]

  @@index([driverId, status])
  @@index([driverId, targetVariantKey])
  @@map("recall_session")
}

model RecallAttempt {
  id             String        @id @default(uuid())
  sessionId      String
  promptIndex    Int
  cardKey        String        // Historical semantic snapshot, not a foreign key
  recallMode     RecallMode
  rawInput       String
  expectedAnswer String        // Exact stopId or pre-normalized stop name
  outcome        RecallOutcome
  startedAt      DateTime
  answeredAt     DateTime      @default(now())
  durationMs     Int           // Server-calculated: answeredAt - startedAt
  session        RecallSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, promptIndex])
  @@index([sessionId])
  @@index([cardKey])
  @@map("recall_attempt")
}
```

*Note on Partial Unique Index*:
Prisma does not natively support PostgreSQL `WHERE` clauses in schema `@unique` attributes. During the implementation phase (Apply), the migration will execute:
```sql
CREATE UNIQUE INDEX "uidx_recall_session_active"
ON "recall_session"("driverId", "targetVariantKey")
WHERE "status" = 'IN_PROGRESS';
```

---

## 7. Application Layer Use Cases

1. **`StartRecallSessionUseCase`**:
   - Input: `{ driverId?: string, routeId: string, variantKey: string }`.
   - Resolves driver (defaulting to `driver_default_local`).
   - Verifies existing active session via `repository.findActiveSession(driverId, variantKey)`.
   - If active session exists, returns existing session DTO (idempotent start).
   - If no active session, persists new `RecallSession` in `IN_PROGRESS` state initialized with first prompt snapshot and returns 201 DTO.
   - Concurrency: Catches P2002 on `uidx_recall_session_active` and resolves to the winning active session.

2. **`GetCurrentRecallPromptUseCase`**:
   - Input: `{ sessionId: string, driverId?: string }`.
   - Retrieves active session; throws `SessionNotFoundError` or `SessionNotActiveError` if terminal (`COMPLETED` or `ABANDONED`).
   - Reconstitutes the active prompt projection directly from the session's snapshotted prompt fields (`currentPromptIndex`, `currentCardKey`, `currentRecallMode`, `currentPromptStartedAt`).
   - Does NOT derive a new expected answer from live GTFS topology.
   - Returns client prompt DTO (hiding `expectedAnswer`).

3. **`SubmitRecallAnswerUseCase`**:
   - Input: `{ sessionId: string, promptIndex: number, rawInput: string, driverId?: string }`.
   - Validates session is `IN_PROGRESS`.
   - **Idempotency Guard**: Queries `repository.findAttemptBySessionAndIndex(sessionId, promptIndex)`. If an attempt already exists, returns the existing evaluation outcome immediately without advancing cursor or recording a duplicate attempt.
   - Evaluates `DriverAnswer` against the session's snapshotted `currentExpectedAnswer`:
     - `NEXT_STOP_FORWARD`: exact string match (`rawInput.trim() === session.currentExpectedAnswer`).
     - `STOP_NAME_RECOGNITION`: normalized equality (`normalizeStopName(rawInput) === session.currentExpectedAnswer`).
   - Calculates duration server-side: `durationMs = answeredAt.getTime() - session.currentPromptStartedAt.getTime()`.
   - Persists `RecallAttempt` in an atomic transaction that advances `currentPromptIndex`, updates `currentCardKey`, and writes the next prompt's snapshot into `RecallSession`.
   - Checks if next prompt exists; if strategy returns `null`, transitions session to `COMPLETED`.
   - Returns `{ outcome: 'PASS' | 'FAIL', isSessionCompleted: boolean }`.

4. **`CompleteRecallSessionUseCase`**:
   - Input: `{ sessionId: string, action: 'COMPLETE' | 'ABANDON', driverId?: string }`.
   - **Completion Semantics**: `COMPLETED` signifies explicit completion by the application use case (either after answering all prompts or by user-initiated early finalization). `ABANDONED` signifies session forfeit.
   - **Terminal State Idempotency**:
     - Calling `COMPLETE` on an already `COMPLETED` session is idempotent (returns completed DTO).
     - Calling `ABANDON` on an already `ABANDONED` session is idempotent (returns abandoned DTO).
     - Cross-terminal transitions (`ABANDONED -> COMPLETE` or `COMPLETED -> ABANDON`) throw `InvalidStateTransitionError`.
   - Persists timestamp and terminal status.
