# Design: 04-driver-learning-state

## 1. Overview & Context

Changes 01 through 03 established the GTFS data ingestion and read-query layer (`01-domain-foundation`, `02-gtfs-importer`, `03-gtfs-read-query`). These components represent official, read-only public transit schedules.

Change 04 introduces the **Driver Learning State & Card Domain Layer**, establishing the initial write side of the driver domain. A driver can enroll in a route variant to initiate memorisation training. During enrollment, the system extracts the variant's topological sequence and generates deterministic, atomic learning cards representing discrete stations (`STOP`) and station transitions (`NEXT_STOP`).

---

## 2. Architecture Boundary & Core Invariants

### 2.1 The Golden Architecture Invariant

> **A `LearningCard.id` is a persistence identifier only. `cardKey` is the deterministic semantic identity within a `DriverVariantProgress`. Neither may depend on `sequenceIndex`. `variantKey` identifies the current GTFS topology reference and is not itself the permanent identity of a learning card.**

### 2.2 Boundary Separation

```text
┌────────────────────────────────────────────────────────┐
│ GTFS Read Side (Change 01–03)                          │
│ - GtfsRoute, GtfsTrip, GtfsStopTime, GtfsStop          │
│ - RouteVariant (in-memory derived topology)            │
└──────────────────────────┬─────────────────────────────┘
                           │ (Soft Reference by string keys)
┌──────────────────────────▼─────────────────────────────┐
│ Driver Learning Domain (Change 04)                     │
│ - DriverVariantProgress (Aggregate Root)               │
│ - LearningCard (Entity)                                │
│ - STOP and NEXT_STOP Recall Cards                      │
│ - Isolated PostgreSQL Tables (ZERO GTFS FOREIGN KEYS)  │
└────────────────────────────────────────────────────────┘
```

- **Zero GTFS Foreign Keys**: The learning tables (`driver_variant_progress`, `learning_card`) do not declare PostgreSQL foreign keys or Prisma relations to `gtfs_route`, `gtfs_stop`, or `gtfs_trip`. GTFS data can be purged, refreshed, or re-imported without causing cascade deletions or constraint errors on driver learning history.
- **Topological Independence**: Card identity does not include `sequenceIndex`. If an intermediate stop is inserted or removed in future GTFS feeds, existing unaffected stop and transition cards retain their identity and history.

---

## 3. Domain Model Specifications

### 3.1 Aggregate Root: `DriverVariantProgress`

Located at `src/domain/learning/driver-variant-progress.ts`:

```typescript
export enum ProgressStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  MASTERED = 'MASTERED',
}

export interface DriverVariantProgressProps {
  id: string; // UUID v4
  driverId: string; // Non-nullable driver identifier
  routeId: string; // Soft ref to GTFS route
  directionId: number; // 0 | 1
  targetVariantKey: string; // Current GTFS topology fingerprint
  status: ProgressStatus;
  enrolledAt: Date;
  lastStudiedAt: Date | null;
  cards?: LearningCard[];
}
```

### 3.2 Entity: `LearningCard`

Located at `src/domain/learning/learning-card.ts`:

```typescript
export enum CardType {
  STOP = 'STOP',
  NEXT_STOP = 'NEXT_STOP',
}

export enum CardState {
  NEW = 'NEW',
  LEARNING = 'LEARNING',
  REVIEW = 'REVIEW',
  MASTERED = 'MASTERED',
}

export interface LearningCardProps {
  id: string; // UUID v4 persistence identifier
  progressId: string; // UUID parent progress reference
  cardKey: string; // Semantic deterministic key within progress
  cardType: CardType;
  state: CardState;
  nextReviewAt: Date | null;
  repetitions: number;
  lapses: number;
}
```

### 3.3 Deterministic Card Key Generator

Located at `src/domain/learning/card-key-generator.ts`:

- **STOP Card**:
  - Format: `STOP::{stopId}`
  - Example: `STOP::place_uq_lakes`
  - Semantic Goal: Identify the station, timepoint designation, and physical platform characteristics.
  - Topology Invariance: The identity depends purely on the stop itself. If new stations are inserted or station order is renumbered, the `STOP::{stopId}` key remains completely unchanged.
- **NEXT_STOP Card**:
  - Format: `NEXT_STOP::{fromStopId}->{toStopId}`
  - Example: `NEXT_STOP::place_rbwh->place_king_george`
  - Semantic Goal: Sequential traversal recall (upon departing station A, recall the next arrival stop).
  - Topology Invariance: The identity depends on the directed adjacent pair `(fromStopId, toStopId)`. A transition card remains stable iff the exact same adjacent edge exists in the current topology. If station X is inserted into A -> B to make A -> X -> B, the A -> B transition ceases to represent an adjacent edge in the new topology, and new transitions A -> X and X -> B are generated.
- **Consumption of Existing `variantKey` Format**: Consumes the Change 01/03 signature `${routeId}_DIR${directionId}_${orderedStopIds.join('>')}`. Change 04 does not reinvent or alter this signature.

### 3.4 Current Topology Projection Attribute & Inert SRS State

- **Dynamic Sequence Projection**:
  - `sequenceIndex` is strictly a runtime projection property derived when cards are served against the current route variant topology.
  - For `STOP::{stopId}`: `currentSequence = sequence of stopId` (1-based index).
  - For `NEXT_STOP::{fromStopId}->{toStopId}`: `currentSequence = sequence of fromStopId` (departure station index).
  - `sequenceIndex` is never written to `LearningCard.cardKey` and is never persisted in database tables.
- **Inert SRS State Policy**:
  - `repetitions = 0`, `lapses = 0`, `nextReviewAt = null` are initialized as inert persistence fields.
  - Change 04 strictly prohibits interval calculation, ease factor, stability, or review scheduling algorithms. Status transitions (`NOT_STARTED` -> `IN_PROGRESS` -> `MASTERED`) are deferred to active study session changes.

---

## 4. Persistence Schema Design (Prisma)

Located in `prisma/schema.prisma` (new models added):

```prisma
enum ProgressStatus {
  NOT_STARTED
  IN_PROGRESS
  MASTERED
}

enum CardType {
  STOP
  NEXT_STOP
}

enum CardState {
  NEW
  LEARNING
  REVIEW
  MASTERED
}

model DriverVariantProgress {
  id               String         @id @default(uuid())
  driverId         String
  routeId          String
  directionId      Int
  targetVariantKey String
  status           ProgressStatus @default(NOT_STARTED)
  enrolledAt       DateTime       @default(now())
  lastStudiedAt    DateTime?
  cards            LearningCard[]

  @@unique([driverId, targetVariantKey])
  @@index([driverId, routeId])
  @@map("driver_variant_progress")
}

model LearningCard {
  id           String                @id @default(uuid())
  progressId   String
  cardKey      String
  cardType     CardType
  state        CardState             @default(NEW)
  nextReviewAt DateTime?
  repetitions  Int                   @default(0)
  lapses       Int                   @default(0)
  progress     DriverVariantProgress @relation(fields: [progressId], references: [id], onDelete: Cascade)

  @@unique([progressId, cardKey])
  @@index([progressId, cardType])
  @@map("learning_card")
}
```

### Schema Guarantees:
1. `@@unique([driverId, targetVariantKey])`: Prevents duplicate enrollments for the same driver and route variant.
2. `@@unique([progressId, cardKey])`: Enforces cardKey uniqueness within a progress aggregate while allowing identical stop cards to exist in distinct variants.
3. `onDelete: Cascade`: Deleting a progress record cleanly removes its learning cards.
4. **No Relations to `Gtfs*` Tables**: Complete physical and logical decoupling from GTFS transport data.

---

## 5. Repository Contract: `LearningProgressRepository`

Located at `src/application/learning/learning-progress-repository.port.ts`:

```typescript
export interface LearningProgressRepository {
  findByDriverAndVariant(
    driverId: string,
    variantKey: string
  ): Promise<DriverVariantProgress | null>;

  findById(id: string): Promise<DriverVariantProgress | null>;

  /**
   * Atomic Transaction Contract:
   * MUST persist DriverVariantProgress and all associated LearningCard records
   * within a single atomic database transaction ($transaction).
   * If any card or progress insertion fails, 100% of the operation is rolled back,
   * leaving zero progress records and zero cards in the database.
   */
  saveProgressWithCards(progress: DriverVariantProgress): Promise<void>;
}
```

---

## 6. Zero-Auth Identity Strategy

Located at `src/application/learning/auth-constants.ts`:

```typescript
export const DEFAULT_DRIVER_ID = 'driver_default_local';
```

- In the current phase, HTTP Route Handlers resolve the driver ID as:
  `const driverId = DEFAULT_DRIVER_ID;`
- **Security Rule**: The API does not parse client-controlled headers (e.g. `x-driver-id`) to simulate multi-tenancy.
- Use cases and domain models accept `driverId: string` as an explicit parameter.
- Test suites instantiate multiple distinct drivers (`'driver_alice'`, `'driver_bob'`) to verify data isolation at the repository and application layers.

---

## 7. Application Use Cases

### 7.1 `EnrollVariantUseCase`

Located at `src/application/learning/enroll-variant-use-case.ts`:

1. **Query Variant Topology**: Calls `GetRouteVariantsUseCase` to retrieve variants for the target `routeId`. Locates the variant matching `variantKey`. If not found, throws `VariantNotFoundError` (mapped to HTTP 404 `VARIANT_NOT_FOUND`).
2. **Sequential Idempotency Check**: Calls `learningProgressRepository.findByDriverAndVariant(driverId, variantKey)`. If already enrolled, returns the existing progress DTO with status 200 OK (no duplicate records, no duplicate cards created).
3. **Card Generation Rules & Boundaries**:
   - `orderedStops.length >= 1`: creates exactly 1 `STOP` card (`STOP::{stopId}`) for each stop.
   - `orderedStops.length >= 2`: creates exactly (N - 1) `NEXT_STOP` cards (`NEXT_STOP::{from}->{to}`) for each adjacent pair.
   - If `orderedStops.length === 1`: creates 1 `STOP` card and 0 `NEXT_STOP` cards.
4. **Concurrent Enrollment Idempotency**:
   - The aggregate is persisted via `saveProgressWithCards`.
   - If two concurrent requests race past the initial check, the database `@@unique([driverId, targetVariantKey])` constraint rejects the second insertion with a uniqueness violation (Prisma `P2002`).
   - The repository/use case intercepts this specific conflict, retrieves the newly created existing progress, and returns it idempotently with status 200 OK instead of surfacing an unexpected 500 error.
5. **Output**: Returns `DriverVariantProgressDto`.

### 7.2 `GetVariantProgressUseCase`

Located at `src/application/learning/get-variant-progress-use-case.ts`:

1. Queries progress and cards via `learningProgressRepository.findByDriverAndVariant(driverId, variantKey)`.
2. If progress does not exist for this driver, throws `ProgressNotFoundError` (mapped to HTTP 404 `PROGRESS_NOT_FOUND`).
3. **GTFS Topology Resilience**:
   - Queries `GetRouteVariantsUseCase` to locate the current topology corresponding to `targetVariantKey`.
   - **If current GTFS topology resolves**: projects `currentSequence` (1-based index for `STOP`, departure index for `NEXT_STOP`) onto each card dynamically.
   - **If current GTFS topology is missing or unresolvable** (e.g. GTFS feed purged or route decommissioned): `currentSequence` is set to `null`.
   - **Critical Resilience Guarantee**: The system strictly NEVER deletes or invalidates existing `DriverVariantProgress` or `LearningCard` records during GTFS changes.
4. Returns `DriverVariantProgressWithCardsDto`.

---

## 8. HTTP API Specifications

### 8.1 `POST /api/progress/enroll`

- **Request Body**:
  ```json
  {
    "routeId": "R66",
    "variantKey": "R66_DIR0_place_rbwh>place_uq_lakes"
  }
  ```
- **Response (201 Created for new enrollment; 200 OK for idempotent repeat)**:
  ```json
  {
    "data": {
      "id": "c1f7b8e2-9b2f-4e6f-9a1b-0e4d7e8b9a1c",
      "driverId": "driver_default_local",
      "routeId": "R66",
      "directionId": 0,
      "targetVariantKey": "R66_DIR0_place_rbwh>place_uq_lakes",
      "status": "NOT_STARTED",
      "enrolledAt": "2026-09-10T22:30:00.000Z",
      "lastStudiedAt": null,
      "totalCards": 19
    }
  }
  ```
- **Error Responses**:
  - 400 Bad Request: `{ error: { code: 'INVALID_REQUEST', message: string } }` (missing routeId or variantKey)
  - 404 Not Found: `{ error: { code: 'VARIANT_NOT_FOUND', message: 'Target route variant does not exist in GTFS official schedule' } }`
  - 500 Internal Error: `{ error: { code: 'INTERNAL_ERROR', message: string } }`

### 8.2 `GET /api/progress/[variantKey]`

- **URL Parameter & Encoding Rule**:
  - `variantKey` contains URL-sensitive characters (such as `>`).
  - **Client Requirement**: Client MUST encode the parameter via `encodeURIComponent(variantKey)` (e.g. `R66_DIR0_place_rbwh%3Eplace_uq_lakes`).
  - **Server Requirement**: Next.js automatically decodes path parameters into `context.params`. The Route Handler operates directly on the decoded string and MUST NOT apply a redundant `decodeURIComponent` (preventing double-decoding risks).
- **Response (200 OK)**:
  ```json
  {
    "data": {
      "id": "c1f7b8e2-9b2f-4e6f-9a1b-0e4d7e8b9a1c",
      "driverId": "driver_default_local",
      "routeId": "R66",
      "directionId": 0,
      "targetVariantKey": "R66_DIR0_place_rbwh>place_uq_lakes",
      "status": "NOT_STARTED",
      "enrolledAt": "2026-09-10T22:30:00.000Z",
      "lastStudiedAt": null,
      "cards": [
        {
          "id": "8f3b1a2c-...",
          "cardKey": "STOP::place_rbwh",
          "cardType": "STOP",
          "state": "NEW",
          "nextReviewAt": null,
          "repetitions": 0,
          "lapses": 0,
          "currentSequence": 1
        },
        {
          "id": "9a4c2b3d-...",
          "cardKey": "NEXT_STOP::place_rbwh->place_king_george",
          "cardType": "NEXT_STOP",
          "state": "NEW",
          "nextReviewAt": null,
          "repetitions": 0,
          "lapses": 0,
          "currentSequence": 1
        }
      ]
    }
  }
  ```
- **Error Responses**:
  - 404 Not Found: `{ error: { code: 'PROGRESS_NOT_FOUND', message: 'Driver has not enrolled in this route variant' } }`
  - 500 Internal Error: `{ error: { code: 'INTERNAL_ERROR', message: string } }`

---

## 9. Testing Strategy (TDD Red-Green-Refactor)

1. **Domain Unit Tests**:
   - Deterministic card key generation for `STOP` and `NEXT_STOP`.
   - Invariance verification: inserting a stop does not change existing card keys.
   - Aggregate state transitions (`NOT_STARTED` -> `IN_PROGRESS` -> `MASTERED`).
2. **Repository Integration Tests**:
   - Atomic persistence of progress and cards.
   - Uniqueness constraint enforcement: duplicate enrollment throws or rejects.
   - Cross-driver data isolation (`driver_alice` vs `driver_bob`).
   - Cascade deletion: deleting progress cascades to cards.
   - Independence verification: purging GTFS tables leaves learning records intact.
3. **Application Use Case Tests**:
   - `EnrollVariantUseCase`: generates expected count of STOP and NEXT_STOP cards; idempotent on repeated enrollment.
   - `GetVariantProgressUseCase`: projects dynamic sequence numbers; throws 404 on missing progress.
4. **API Route Handler Integration Tests**:
   - `POST /api/progress/enroll`: validates body, returns 201/200 standard envelope.
   - `GET /api/progress/[variantKey]`: returns 200 with cards, returns 404 for unenrolled variant.
5. **Regression & Full Verification**:
   - 107 existing tests pass with 0 regressions.
   - ESLint 0 errors, Next.js build clean, Prisma validate clean.
