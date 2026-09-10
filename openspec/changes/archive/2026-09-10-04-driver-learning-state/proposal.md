# Proposal: 04-driver-learning-state

## Why

Changes 01 through 03 established the GTFS domain, two-pass atomic ingestion, and read query API. However, the system currently only serves official schedule data; it possesses zero driver learning models or persistence for route memorisation.

To transform GTFS data into an actionable driver training platform, Change 04 introduces the **Driver Learning State & Card Domain Layer**. This establishes the core aggregates representing a driver's learning progress on a route variant and generates deterministic memory cards (`STOP` and `NEXT_STOP`) derived from the variant topology, without coupling learning history to volatile schedule internals or premature UI/SRS complexity.

## What Changes

### 1. Architecture Invariant

> **A `LearningCard.id` is a persistence identifier only. `cardKey` is the deterministic semantic identity within a `DriverVariantProgress`. Neither may depend on `sequenceIndex`. `variantKey` identifies the current GTFS topology reference and is not itself the permanent identity of a learning card.**

### 2. Driver Learning Domain Model

Implement domain entities under `src/domain/learning/`:
- `DriverVariantProgress`: Root aggregate representing a driver's progress on a route variant.
  - Fields: `id` (UUID), `driverId` (string), `routeId` (string), `directionId` (0 | 1), `targetVariantKey` (string), `status` (`NOT_STARTED` | `IN_PROGRESS` | `MASTERED`), `enrolledAt` (Date), `lastStudiedAt` (Date | null).
  - Default status is `NOT_STARTED`. Status transitions are triggered by future study sessions; Change 04 does not implement active status mutation.
- `LearningCard`: Memory card entity representing a discrete recall challenge.
  - Fields: `id` (UUID), `progressId` (UUID), `cardKey` (string), `cardType` (`STOP` | `NEXT_STOP`), `state` (`NEW` | `LEARNING` | `REVIEW` | `MASTERED`), `nextReviewAt` (Date | null), `repetitions` (number), `lapses` (number).
  - **Inert SRS State**: `repetitions = 0`, `lapses = 0`, `nextReviewAt = null` are initialized as inert persistence fields. Change 04 strictly prohibits interval calculation, ease factor, stability, or review scheduling algorithms.
- **Current Topology Projection Attribute**:
  - `sequence` is NOT part of card identity. It is a projected property derived at runtime when cards are served for study or inspection against the current GTFS topology:
    - For `STOP::{stopId}`: `currentSequence = sequence of stopId`.
    - For `NEXT_STOP::{fromStopId}->{toStopId}`: `currentSequence = sequence of fromStopId` (departure station index).

### 3. Two-Tier Card Identity & Semantic Transition Rules

To ensure cards maintain semantic continuity across topology adjustments:
- **`STOP` Card**: `cardKey = STOP::{stopId}`
  - Semantic Goal: Recognize the station, timepoint status, and landmarks.
  - Topology Invariance: The identity remains stable whenever `stopId` is present, regardless of stop renumbering or insertion of other stations.
- **`NEXT_STOP` Card**: `cardKey = NEXT_STOP::{fromStopId}->{toStopId}`
  - Semantic Goal: Sequential traversal recall (departing from station A, what is the next stop?).
  - Topology Invariance: The identity is based on the directed adjacent pair. A transition card remains stable iff that exact adjacent edge exists in the current topology. (If station X is inserted into A -> B to make A -> X -> B, the A -> B transition ceases to represent the current topology and new transitions A -> X and X -> B are produced for the new topology).
- **Uniqueness Scope**: `cardKey` is unique strictly within its parent `DriverVariantProgress` (`@@unique([progressId, cardKey])`). It is NOT a global database primary key.
- **Existing `variantKey` Format**: Consumes Change 01/03's established format: `${routeId}_DIR${directionId}_${orderedStopIds.join('>')}`. Change 04 does not reinvent or alter this signature.

### 4. Zero-Auth Identity Strategy

- `driverId` is a required non-nullable string in the domain and persistence schemas, ensuring forward compatibility with future multi-tenant authentication without future schema migrations.
- In the current Zero-Auth development phase, the Application and API layers use a system constant:
  `export const DEFAULT_DRIVER_ID = 'driver_default_local';`
- Client request headers (e.g. `x-driver-id`) are **strictly prohibited** from acting as an authentication/security selector to prevent spoofing before a real auth subsystem exists.
- Unit and integration tests can pass explicit `driverId` values to verify cross-driver data isolation.

### 5. Decoupled Persistence Schema (Zero GTFS Foreign Keys)

Add Prisma models `DriverVariantProgress` and `LearningCard`:
- `DriverVariantProgress` maintains `driverId`, `routeId`, `directionId`, `targetVariantKey`, and `status`.
- `LearningCard` maintains `progressId`, `cardKey`, `cardType`, `state`, `nextReviewAt`, `repetitions`, and `lapses`.
- **Foreign Key Boundary**: Neither learning table declares foreign keys against GTFS tables (`gtfs_route`, `gtfs_stop`, `gtfs_trip`). GTFS tables remain official transport data that can be re-imported, refreshed, or deleted without cascade failures on driver learning history.
- `LearningCard` cascades delete on `DriverVariantProgress`.

### 6. Application Use Cases

Implement application services under `src/application/learning/`:
- `EnrollVariantUseCase`:
  - Validates the target `routeId` and `variantKey` against `GtfsReadRepository`.
  - Generates deterministic `STOP` and `NEXT_STOP` cards from the variant's ordered stops.
  - Persists `DriverVariantProgress` and cards atomically.
  - **Concurrent Idempotency**: If the driver is already enrolled in the exact `targetVariantKey` (whether sequentially or through a concurrent race resolving with a `P2002` conflict), the use case returns the existing progress without duplicating cards and without throwing `INTERNAL_ERROR`.
- `GetVariantProgressUseCase`:
  - Retrieves `DriverVariantProgress` and cards by `(driverId, variantKey)`.
  - Attaches current topological sequence numbers to cards dynamically.

### 7. Minimal Progress HTTP Endpoints (Strictly 2 Endpoints)

Expose REST endpoints under `src/app/api/progress/`:
- `POST /api/progress/enroll`: Body `{ routeId: string, variantKey: string }` -> 201 Created or 200 OK with `{ data: DriverVariantProgressDto }`.
- `GET /api/progress/[variantKey]`: -> 200 OK with `{ data: DriverVariantProgressWithCardsDto }`, or 404 `{ error: { code: 'PROGRESS_NOT_FOUND', message: string } }`.

## Capabilities

### New Capabilities
- `driver-learning-domain`: Domain aggregates `DriverVariantProgress` and `LearningCard` with deterministic, sequence-independent key generation.
- `learning-persistence`: Prisma persistence models for driver progress and flashcards, decoupled from GTFS tables with zero foreign keys.
- `enrollment-and-progress-services`: Use cases to enroll drivers in route variants and query learning state.
- `progress-api-endpoints`: Next.js Route Handlers `POST /api/progress/enroll` and `GET /api/progress/[variantKey]`.

## Non-Goals (Strictly Out of Scope)

- **No FSRS / SM-2 Scheduling Algorithms**: Spaced repetition interval calculations, stability, and difficulty formulas are deferred to the SRS Engine change.
- **No Quiz / Assessment Execution**: No question generation, answer evaluation, scoring, or submit endpoints.
- **No HAZARD Cards or Driver Notes**: Hazard flashcards and `DriverNote` / `HazardAlert` CRUD are deferred to Change 05+.
- **No Topology Auto-Migration**: Automated Jaccard / Levenshtein card remapping upon GTFS feed update is deferred to Change 0X.
- **No Authentication / User System**: No login, session tokens, user tables, or OAuth integration.
- **No UI / Maps / GIS / GPS**: No frontend components, Leaflet/MapLibre maps, or location tracking.
- **No GTFS-RT**: Real-time vehicle positions and trip updates remain out of scope.
