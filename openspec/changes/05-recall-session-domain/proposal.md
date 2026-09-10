# Proposal: 05-recall-session-domain

## Why

Change 04 successfully established the Driver Learning State and deterministic card aggregates (`DriverVariantProgress`, `LearningCard`). However, the system currently only stores static memory targets ("what to learn"); it lacks a memory retrieval and training execution model ("how to recall").

To transform stored memory cards into active driver route memorisation cycles, Change 05 introduces the **Recall Domain Model**. This defines the lifecycle of a driver training session (`RecallSession`), transient challenge projections (`RecallPrompt`), deterministic driver response evaluations (`RecallOutcome`), and telemetry records (`RecallAttempt`), without contaminating the domain with premature Quiz UI widgets, multiple-choice distractors, fuzzy matching, or FSRS/SM-2 spaced repetition algorithms.

---

## What Changes

### 1. Architecture Invariant

> **`LearningCard` is a persistent learning target; `RecallSession` is an active training workflow; `RecallPrompt` is a transient evaluation projection. A `RecallPrompt` is never persisted as a database table. Once generated, a `RecallPrompt` establishes an immutable evaluation snapshot for that attempt. Existing prompts must evaluate against their snapshot regardless of subsequent GTFS topology mutations.**

---

### 2. Recall Domain Model

Implement domain entities under `src/domain/recall/`:

- **`RecallSession`**: Aggregate root representing a single driver route training session.
  - Fields:
    - Identity & Scope: `id` (UUID), `driverId` (string), `routeId` (string), `targetVariantKey` (string), `status` (`SessionStatus`: `IN_PROGRESS` | `COMPLETED` | `ABANDONED`).
    - Progress Cursor: `currentPromptIndex` (number), `currentCardKey` (string | null).
    - Active Prompt Snapshot: `currentRecallMode` (`RecallMode` | null), `currentExpectedAnswer` (string | null), `currentPromptStartedAt` (Date | null).
    - Lifecycle Timestamps: `startedAt` (Date), `completedAt` (Date | null), `abandonedAt` (Date | null).
  - Lifecycle Rules: Starts directly in `IN_PROGRESS`. Terminal states (`COMPLETED`, `ABANDONED`) are strictly non-resurrectable. Re-training requires initiating a new session.
- **`RecallPrompt`**: Transient domain projection representing an active recall challenge presented to the driver.
  - Fields: `promptId` (UUID), `sessionId` (UUID), `cardKey` (string), `promptIndex` (number), `recallMode` (`RecallMode`), `givenReference` (string), `expectedAnswer` (string, snapshot value), `createdAt` (Date).
  - *Transient*: Not stored as a separate table; its evaluation state is snapshotted directly on `RecallSession`.
- **`DriverAnswer`**: Value object encapsulating the driver's response.
  - Fields: `sessionId` (UUID), `promptIndex` (number), `rawInput` (string), `submittedAt` (Date).
- **`RecallOutcome`**: Binary evaluation outcome enum.
  - Values: `PASS` | `FAIL` (Strictly binary; zero `PARTIAL` or fuzzy scores in Change 05).
- **`RecallAttempt`**: Telemetry entity capturing the historical record of an individual recall answer and outcome.
  - Fields: `id` (UUID), `sessionId` (UUID), `promptIndex` (number), `cardKey` (string, immutable semantic snapshot), `recallMode` (`RecallMode`), `rawInput` (string), `expectedAnswer` (string), `outcome` (`RecallOutcome`), `startedAt` (Date), `answeredAt` (Date), `durationMs` (number).
  - *Idempotent Anchor*: `@@unique([sessionId, promptIndex])` ensures exact 1:1 mapping between session prompt index and attempt telemetry.
  - *Historical Semantic Snapshot*: `cardKey` is an immutable snapshot value scoped by the owning `RecallSession`'s `targetVariantKey`. It is not a foreign key or global identifier.
  - *Server-Side Duration*: `durationMs` is strictly calculated server-side as `answeredAt - startedAt` (using `session.currentPromptStartedAt`). Client input cannot manipulate duration.

---

### 3. Recall Modes & Expected Answer Representations

Change 05 implements **exactly two** recall modes with unambiguous snapshot representations:

1. **`NEXT_STOP_FORWARD`**:
   - Source: `LearningCard.cardType === 'NEXT_STOP'`.
   - Semantic Goal: Sequential route traversal memory ("Departing from Stop A, what is the immediate next stop?").
   - Given: `fromStopId` (and stop name from topology projection).
   - Expected Representation: Exact canonical `stopId` (e.g., `'stop_kg'`).
   - Target Evaluation: Exact canonical `stopId` comparison (`rawInput.trim() === expectedAnswer`).
   - Boundary Rule: For a route variant with N stops, exactly N - 1 `NEXT_STOP_FORWARD` prompts are produced (`max(N - 1, 0)`). The terminus stop has no following stop and generates zero forward prompts.

2. **`STOP_NAME_RECOGNITION`**:
   - Source: `LearningCard.cardType === 'STOP'`.
   - Semantic Goal: Station identity and landmark recognition ("At topology position N, what is the official stop name?").
   - Given: `stopId` and route sequence index.
   - Expected Representation: Pre-normalized stop name (e.g., `'central station'`).
   - Target Evaluation: `normalizeStopName(rawInput) === expectedAnswer`.
   - Disambiguation: Normalized stop names are evaluation comparison values, not unique stop identifiers. Targets are strictly selected via canonical `stopId`.

---

### 4. Deterministic Evaluation & Stop Name Normalization

Evaluation in Change 05 is strictly deterministic and objective:
- **Canonical ID Match**: For `NEXT_STOP_FORWARD`, the input is matched directly against the expected `stopId`.
- **Deterministic Name Normalization**: For `STOP_NAME_RECOGNITION` when text is compared, inputs are processed through an exact pipeline:
  ```text
  normalize(text) = text
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  ```
- **Evaluation Disambiguation**: Normalized stop names are evaluation comparison values, not unique stop identifiers. Target stops are strictly disambiguated by `stopId`.
- **Strict Prohibition**: No Levenshtein distance, phonetic matching, Soundex, regex heuristics, fuzzy thresholding, or AI/LLM evaluations are permitted.

---

### 5. Active Session Concurrency & Partial Unique Index

To guarantee that a driver cannot have multiple concurrent active sessions for the same route variant:
- **Domain Invariant**: Exactly one active session (`status === 'IN_PROGRESS'`) per `(driverId, targetVariantKey)`.
- **Persistence Guarantee**: Enforced at the PostgreSQL level via a Partial Unique Index:
  ```sql
  CREATE UNIQUE INDEX "uidx_recall_session_active"
  ON "recall_session"("driverId", "targetVariantKey")
  WHERE "status" = 'IN_PROGRESS';
  ```
- **Concurrency Test**: `Promise.all([startSession(A), startSession(A)])` MUST resolve to exactly one active session. Only the specific P2002 corresponding to `uidx_recall_session_active` may be converted to idempotent success; all unrelated errors MUST be rethrown.

---

### 6. Active Prompt Snapshot Preservation & Immutability

To guarantee prompt immutability without a separate prompt table:
- When a prompt is served or cursor advances, `RecallSession` snapshots:
  - `currentPromptIndex`
  - `currentCardKey`
  - `currentRecallMode`
  - `currentExpectedAnswer`
  - `currentPromptStartedAt`
- Re-reading the active prompt via `GetCurrentRecallPromptUseCase` returns this stored snapshot. It MUST NOT derive a new `expectedAnswer` from live GTFS topology.
- Answers are evaluated strictly against `session.currentExpectedAnswer`, ensuring complete immunity from concurrent GTFS updates.

---

### 7. Strategy Pattern: `PromptSelectionStrategy`

To avoid hardcoding sequential traversal as an immutable domain invariant:
- Define port/interface: `PromptSelectionStrategy`.
  - Method: `selectNextPrompt(session: RecallSession, cards: LearningCard[], topology: RouteVariantDto | null): RecallPrompt | null`.
- Change 05 implements **only**:
  - `SequentialTopologyPromptStrategy`: Walks the variant stops in forward topological order (1 → N).
- Architecture preserves extension points for future changes (`SRS_DUE`, `WEAK_FIRST`, `RANDOM`) without altering the `RecallSession` aggregate.

---

### 8. Application Use Cases & Idempotency Rules

Implement exactly four application services under `src/application/recall/`:

1. **`StartRecallSessionUseCase`**:
   - Validates driver enrollment in `targetVariantKey` (via Change 04 repository).
   - Aborts or re-attaches if an `IN_PROGRESS` session exists.
   - Atomically persists new `RecallSession` in `IN_PROGRESS` state.
2. **`GetCurrentRecallPromptUseCase`**:
   - Resolves the active session.
   - Returns the active prompt projection reconstituted from the session's snapshotted prompt fields.
   - Hides `expectedAnswer` from client DTO.
3. **`SubmitRecallAnswerUseCase`**:
   - Input: `{ sessionId: string, promptIndex: number, rawInput: string }`.
   - **Idempotency Guard**: Queries `repository.findAttemptBySessionAndIndex(sessionId, promptIndex)`. If an attempt already exists, returns the existing evaluation outcome immediately without evaluating, advancing cursor, or recording a duplicate attempt.
   - Evaluates `DriverAnswer` deterministically against `session.currentExpectedAnswer`.
   - Calculates server-side `durationMs = now() - session.currentPromptStartedAt`.
   - Atomically records `RecallAttempt` (with `promptIndex`) and advances session cursor and active prompt snapshot.
   - If prompts are exhausted, transitions session to `COMPLETED`.
4. **`CompleteRecallSessionUseCase`**:
   - Input: `{ sessionId: string, action: 'COMPLETE' | 'ABANDON' }`.
   - **Completion Semantics**: `COMPLETED` signifies explicit completion by the application use case (either after answering all prompts or by user-initiated early finalization). `ABANDONED` signifies session forfeit.
   - **Terminal State Idempotency**: Calling `COMPLETE` on an already `COMPLETED` session is an idempotent success. Calling `ABANDON` on an already `ABANDONED` session is an idempotent success.
   - Cross-terminal state transitions (`ABANDONED -> COMPLETED` or `COMPLETED -> ABANDONED`) are strictly rejected.

---

### 9. Persistence Schema & Zero GTFS Foreign Keys

Add two Prisma models under `prisma/schema.prisma`:
- `RecallSession`:
  - Fields: `id`, `driverId`, `routeId`, `targetVariantKey`, `status` (`IN_PROGRESS` | `COMPLETED` | `ABANDONED`), `currentPromptIndex`, `currentCardKey`, `currentRecallMode`, `currentExpectedAnswer`, `currentPromptStartedAt`, `startedAt`, `completedAt`, `abandonedAt`.
  - Relations: Cascades to `RecallAttempt`.
  - Indexes: Composite on `(driverId, status)`, partial unique index on `(driverId, targetVariantKey)` where `status = 'IN_PROGRESS'`.
- `RecallAttempt`:
  - Fields: `id`, `sessionId`, `promptIndex`, `cardKey`, `recallMode`, `rawInput`, `expectedAnswer`, `outcome`, `startedAt`, `answeredAt`, `durationMs`.
  - Unique Constraint: `@@unique([sessionId, promptIndex])` guarantees attempt idempotency.
  - Relations: Foreign key to `RecallSession` (`onDelete: Cascade`).
- **Boundaries**:
  - **Zero GTFS FK**: `recall_session` and `recall_attempt` contain string references only (`routeId`, `targetVariantKey`, `cardKey`). No foreign keys to `gtfs_*` tables.
  - **Zero LearningCard FK**: `cardKey` is stored as an immutable historical semantic snapshot string to ensure deletion or archiving of cards does not corrupt audit attempt telemetry.

---

### 10. Driver Identity Strategy

- Reuses Change 04's `DEFAULT_DRIVER_ID = 'driver_default_local'`.
- No authentication, session tokens, cookies, or client-specified `x-driver-id` headers.
- Unit and integration tests pass explicit driver identifiers (`driver-alice`, `driver-bob`) to verify strict isolation.

---

## Non-Goals (Strictly Out of Scope)

The following capabilities are explicitly forbidden in Change 05:

- ❌ **FSRS / SM-2 Algorithms**: No ease factor, interval, stability, difficulty, or review scheduling mutations.
- ❌ **Mutating LearningCard SRS Fields**: `LearningCard.repetitions`, `lapses`, and `nextReviewAt` remain inert in Change 05.
- ❌ **Quiz Engine / Presentation**: No quiz questions, multiple-choice options, distractors, or quiz scoring components.
- ❌ **Multiple Choice / Distractors**: No generating fake alternative stops or multiple-choice arrays.
- ❌ **Advanced Recall Modes**: No `MULTI_STOP_CHAIN`, `HEADSIGN_RECALL`, `REVERSE_TRAVERSAL`, or `TIMING_RECALL`.
- ❌ **Fuzzy / AI Scoring**: No Levenshtein distance, Soundex, speech-to-text, voice input, or LLM-based semantic grading.
- ❌ **UI Components**: No React pages, flashcard widgets, map components, or client styling.
- ❌ **GIS / GPS / GTFS-RT**: No geographic distance checks, bus tracking, or realtime arrival integration.
- ❌ **Authentication / User Accounts**: No login forms, JWTs, OAuth, or driver user tables.
- ❌ **Topology Migration / Split Detection**: No automatic updating of past sessions when GTFS updates.
