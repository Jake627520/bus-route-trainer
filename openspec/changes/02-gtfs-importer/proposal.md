# Proposal: 02-gtfs-importer

## Summary
Implement a resilient, memory-bounded, and strictly atomic GTFS data ingestion pipeline for **Bus Route Trainer**. This proposal specifies the infrastructure and application layers required to parse local Translink Queensland GTFS CSV feeds using a **Two-Pass Streaming Model**, validate row schemas, GTFS conditional timing rules, and cross-file referential integrity in memory without loading entire datasets into RAM, and persist entities into PostgreSQL within a single atomic transaction with configurable timeouts. Re-importing identical feeds guarantees strict idempotency, same-feed and database-level conflicting payloads trigger explicit conflict failures, and partial imports are strictly prevented.

## Ingestion Architecture: Two-Pass Streaming Model

### Runtime Processing Flow
```
Local GTFS Directory (CSV files on disk)
  │
  ├───► PASS 1: Streaming Validation Pass (Zero DB Mutations)
  │     ├── CSV Stream Parser (raw field preservation, RFC-4180 compliant)
  │     ├── Header & Row Schema Validation (Zod schemas)
  │     ├── Lightweight Key Set Collection (validAgencyIds, validRouteIds, validStopIds, validTripIds, validServiceIds)
  │     ├── Cross-File Referential Integrity Verification:
  │     │     ├── route.agency_id -> validAgencyIds (required for multi-agency, optional for single-agency)
  │     │     ├── trip.route_id -> validRouteIds
  │     │     ├── trip.service_id -> ValidServiceIds (calendar.service_id ∪ calendar_dates.service_id)
  │     │     └── stop_time.trip_id -> validTripIds & stop_time.stop_id -> validStopIds
  │     ├── Feed-Internal Duplicate & Conflict Detection:
  │     │     └── Rejects any duplicate primary/composite key within the same incoming feed
  │     ├── Stop Sequence Monotonicity & Timing Verification:
  │     │     ├── strictly increasing per trip (non-consecutive allowed)
  │     │     ├── timepoint=1 requires arrival_time and departure_time
  │     │     └── first stop requires departure_time; last stop requires arrival_time
  │     └── Result: Validation Report (PASS -> proceed to Pass 2; FAIL -> abort immediately)
  │
  └───► PASS 2: Streaming Persistence Pass (Single Atomic Transaction)
        ├── Re-read same local CSV files from disk via stream parser
        ├── Open single interactive database transaction (prisma.$transaction) with configurable timeout
        ├── Topological Chunked Batch Ingestion (Agency -> Calendars -> Routes -> Stops -> Trips -> StopTimes)
        ├── Strict Database Idempotency Check:
        │     ├── Identical existing payload -> idempotent PASS (no-op)
        │     └── Conflicting existing payload -> ImportConflictError (abort and roll back)
        └── Result: COMMIT on success (zero partial import) or ROLLBACK on abort
```

### Compile-Time Dependency Rule
```
       ┌────────────────────────┐
       │      Domain Layer      │  (Pure TypeScript, zero external dependencies)
       └───────────▲────────────┘
                   │ depends on
       ┌───────────┴────────────┐
       │   Application Layer    │  (Use cases, defines GtfsRepository typed port)
       └───────────▲────────────┘
                   │ implements / depends on
       ┌───────────┴────────────┐
       │  Infrastructure Layer  │  (CSV Parser, PrismaGtfsRepository, Node fs)
       └────────────────────────┘
```
- **Domain**: Pure TypeScript domain models. Zero dependencies on Prisma, CSV parsers, or Node fs.
- **Application**: Coordinates the two-pass import workflow and defines the typed `GtfsRepository` port interface.
- **Infrastructure**: Implements `GtfsRepository` with Prisma, executes CSV streaming, and reads local disk files.

## Scope: Core GTFS Files & Requirement Definitions (V1)
In strict alignment with the official GTFS Schedule Reference (revised 2026):
1. `agency.txt` (**Required** by GTFS specification):
   - Mandatory file.
   - `agency_id` (**Conditionally Required** by GTFS):
     - Multi-agency feed: `agency_id` is **Required**.
     - Single-agency feed: `agency_id` is **Optional/Recommended**. If omitted, V1 assigns a deterministic internal identifier (e.g. `"DEFAULT_AGENCY"`).
     - Multi-agency feed with missing `agency_id`: Validation **FAILS**.
2. `stops.txt` (**Conditionally Required by GTFS; Required for V1 fixed-route profile**):
   - GTFS specification defines `stops.txt` as Conditionally Required (e.g. absent in demand-responsive zones defined by `locations.geojson`).
   - For this V1 fixed-route bus trainer application profile, `stops.txt` is **Required**.
   - Fields: `stop_id`, `stop_name`, `stop_lat`, `stop_lon`.
3. `routes.txt` (**Required** by GTFS specification):
   - Mandatory file.
   - Fields: `route_id`, `route_short_name`, `route_long_name`, `route_type`.
   - `agency_id` (**Conditionally Required** by GTFS):
     - Required when feed contains multiple agencies; optional when feed contains a single agency.
     - Validated in Pass 1 against `validAgencyIds`.
4. `trips.txt` (**Required** by GTFS specification):
   - Mandatory file.
   - Fields: `trip_id`, `route_id`, `service_id`, `direction_id`, `trip_headsign` (optional), `shape_id` (optional).
5. `stop_times.txt` (**Required** by GTFS specification):
   - Mandatory file.
   - Persisted fields (V1): `trip_id`, `stop_sequence`, `stop_id`, `arrival_time`, `departure_time`, `timepoint`.
   - Sequence rules: `stop_sequence` is a non-negative integer that strictly increases per trip. Non-consecutive increasing values (e.g. `1, 23, 40`) are strictly valid.
   - Timing rules: `24:10:00` and `25:05:00` service-day times are valid. `timepoint=1` requires both arrival and departure times. First stop requires departure time; last stop requires arrival time.
   - Deferred fields: `stop_headsign`, `pickup_type`, `drop_off_type`, `shape_dist_traveled` are parsed and syntax-validated, but intentionally not persisted in V1. Their presence is tracked in `ImportSummary.diagnostics`.
6. `calendar.txt` & `calendar_dates.txt` (**Conditionally Required** by GTFS specification):
   - **Case A**: Both `calendar.txt` and `calendar_dates.txt` exist.
   - **Case B**: `calendar.txt` is absent, and `calendar_dates.txt` independently defines all active service dates.
   - Service ID Universe: $\text{ValidServiceIds} = \text{Set}(\text{calendar.service\_id}) \cup \text{Set}(\text{calendar\_dates.service\_id})$.

*Reserved (Future Scope, deferred)*:
- `shapes.txt`: Polyline coordinates for map rendering (deferred to Change 03 Route Explorer & Map).

## Explicit Non-Goals (Scope Protection for V1)
- ❌ No GTFS-Realtime (GTFS-RT), live vehicle positions, trip updates, or alerts.
- ❌ No automatic Translink HTTP downloading or cloud sync. Accepts local directory paths only.
- ❌ No Route Map UI, Route Explorer UI, Quiz UI, or Driver UI.
- ❌ No Spaced Repetition System (SRS) algorithms or review scheduler.
- ❌ No driver authentication, multi-tenant accounts, or cloud IAM.
- ❌ No AI / LLM features.
- ❌ No Mode 2 Full Feed Replacement (destructive purge of GTFS data); V1 is strictly scoped to Mode 1.

## Critical Ingestion Contracts

### 1. Transaction Atomicity Contract (Option A: Single Transaction)
- Pass 2 persistence executes entirely within a single database transaction (`prisma.$transaction`).
- Transaction timeout and maxWait are **configurable** via `ImportGtfsOptions` (defaulting to 120,000ms for development, with production support for longer windows matching feed sizes).
- If any failure occurs during Pass 2 (e.g. at row 500,001 of `stop_times`), PostgreSQL rolls back the entire transaction. **Zero partial records or orphaned entities will be left in the database.**

### 2. Strict Idempotency, Duplicate, and Conflict Rejection Contract (Mode 1)
- **Feed-Internal Duplicate Rejection**: If the incoming feed contains duplicate primary or composite keys (e.g. two rows with `route_id=100` or two rows with `(T1, seq 5)`), the importer **REJECTS** the feed immediately. GTFS primary keys must be unique within a feed.
- **Feed-Internal Conflict Rejection**: Duplicate keys with differing attributes in the same feed trigger an immediate **`ImportConflictError`**.
- **Database Idempotency (Identical Payload)**: Re-importing a record matching an existing database key with identical attributes succeeds as an idempotent no-op.
- **Database Conflict (Conflicting Payload)**: Re-importing a record matching an existing database key with differing attribute values triggers an **`ImportConflictError`** and aborts the import.
- **Deferred Field Semantics**: Conflict detection compares only persisted V1 fields. Differences in deferred fields do not trigger a database conflict.
- **Stale Records**: Mode 1 does not remove records absent from the current feed. Destructive feed replacement is deferred to future Mode 2.
- **Driver Data Isolation**: Driver knowledge (`DriverNote`, `HazardAlert`) resides in isolated tables and is never touched, modified, or deleted by GTFS ingestion.

### 3. Memory-Bounded Streaming Contract
- Full dataset arrays are **NEVER** loaded into memory simultaneously (`no parseAll()`).
- Memory consumption consists of:
  - Lightweight cross-file identifier sets (`validAgencyIds`, `validRouteIds`, `validStopIds`, `validTripIds`, `validServiceIds`).
  - Active per-trip sequence validation tracking (`Map<string, number>`).
  - Current persistence batch chunk (e.g. 1,000 rows).
- Memory scales with the number of unique identifiers required for referential validation, strictly **NOT** with the full row payload.

## Acceptance Criteria
- [ ] Minimal synthetic GTFS test fixture created in `tests/fixtures/gtfs/` (zero real Translink data committed).
- [ ] GTFS file requirement wording strictly respected: `agency.txt` Required; `agency_id` Conditionally Required; `stops.txt` Conditionally Required by GTFS (Required for V1 fixed-route profile); `calendar.txt` & `calendar_dates.txt` Conditionally Required.
- [ ] `routes.agency_id` referential validation: multi-agency requires `agency_id`; single-agency allows omission; present values must reference `validAgencyIds`.
- [ ] Cross-file referential integrity enforced: `trip.route_id`, `trip.service_id` (via Service ID Union), `stop_time.trip_id`, and `stop_time.stop_id`.
- [ ] Same-feed duplicate primary key rejection: duplicate keys within the incoming feed trigger validation failure.
- [ ] Same-feed conflicting payload rejection: duplicate keys with differing values trigger `ImportConflictError`.
- [ ] Database idempotency verified: identical feed re-import succeeds with zero duplicate records; conflicting payload triggers `ImportConflictError`.
- [ ] Stop sequence monotonicity verified: non-consecutive increasing values (`1, 23, 40`) PASS; duplicate (`1, 23, 23`) FAIL; descending (`1, 40, 23`) FAIL; multi-trip independence PASS.
- [ ] GTFS conditional timing rules verified: `24:10:00` and `25:05:00` PASS; `timepoint=1` with missing times FAIL; first stop missing departure FAIL; last stop missing arrival FAIL.
- [ ] Agency ID conditional validation: single-agency omission PASS with default ID; multi-agency omission FAIL.
- [ ] Conditional calendar ingestion verified for both Case A (`calendar` + `calendar_dates`) and Case B (`calendar_dates` only).
- [ ] Single transaction atomicity verified: mid-import error triggers 100% rollback with zero partial data retained.
- [ ] Configurable transaction timeout verified: timeout parameters configurable via import options.
- [ ] Typed repository port abstraction verified: Application layer interacts exclusively with `GtfsRepository` typed interface (no generic dynamic table strings).
- [ ] Deferred fields semantics verified: `stop_headsign`, `pickup_type`, `drop_off_type`, `shape_dist_traveled` validated, not persisted, tracked in diagnostics, excluded from DB conflict comparison.
- [ ] Zero real Translink GTFS data committed to repository.
- [ ] Zero Prisma schema modifications required in this Change.
- [ ] Implementation remains NOT STARTED before formal approval.
