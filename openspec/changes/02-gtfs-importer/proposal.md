# Proposal: 02-gtfs-importer

## Summary
Implement a resilient, memory-efficient, and strictly atomic GTFS data ingestion pipeline for **Bus Route Trainer**. This proposal specifies the infrastructure and application layers required to parse local Translink Queensland GTFS CSV feeds using a **Two-Pass Streaming Model**, validate row schemas and cross-file referential integrity in memory without ballooning RAM, and persist entities into PostgreSQL within a single atomic transaction. Re-importing identical feeds guarantees strict idempotency, conflicting payloads trigger explicit conflict failures, and partial imports are strictly prevented.

## Ingestion Architecture: Two-Pass Streaming Model

### Runtime Processing Flow
```
Local GTFS Directory (CSV files on disk)
  │
  ├───► PASS 1: Streaming Validation Pass (Zero DB Mutations)
  │     ├── CSV Stream Parser (raw field preservation, RFC-4180 compliant)
  │     ├── Header & Row Schema Validation (Zod schemas)
  │     ├── Lightweight Key Set Collection (route_ids, stop_ids, trip_ids, service_ids)
  │     ├── Cross-File Referential Integrity Verification (Trip->Route, Trip->Service, StopTime->Trip/Stop)
  │     └── Stop Sequence Monotonicity Verification (strictly increasing per trip)
  │
  └───► PASS 2: Streaming Persistence Pass (Single Atomic Transaction)
        ├── Re-read same local CSV files from disk via stream parser
        ├── Open single interactive database transaction (prisma.$transaction)
        ├── Topological Chunked Batch Ingestion (Agency -> Calendars -> Routes -> Stops -> Trips -> StopTimes)
        ├── Strict Idempotency Check (identical payload allowed; conflicting payload rejected)
        └── Atomic COMMIT or Complete ROLLBACK (zero partial import on failure)
```

### Compile-Time Dependency Rule
```
       ┌────────────────────────┐
       │      Domain Layer      │  (Pure TypeScript, zero external dependencies)
       └───────────▲────────────┘
                   │ depends on
       ┌───────────┴────────────┐
       │   Application Layer    │  (Use cases, defines GtfsRepository port)
       └───────────▲────────────┘
                   │ implements / depends on
       ┌───────────┴────────────┐
       │  Infrastructure Layer  │  (CSV Parser, PrismaGtfsRepository, Node fs)
       └────────────────────────┘
```
- **Domain**: Pure TypeScript domain models. Zero dependencies on Prisma, CSV parsers, or Node fs.
- **Application**: Coordinates the two-pass import workflow and defines the `GtfsRepository` port interface.
- **Infrastructure**: Implements `GtfsRepository` with Prisma, executes CSV streaming, and reads local disk files.

## Scope: Core GTFS Files Handled (V1)
1. `agency.txt` (**Conditionally Required**):
   - Mandatory in GTFS Schedule.
   - If `agency_id` is present, it is preserved and mapped to `GtfsAgency.id`.
   - If `agency_id` is omitted in a **single-agency feed**, an internal deterministic identifier (e.g. `"DEFAULT_AGENCY"`) is assigned.
   - If `agency_id` is omitted in a **multi-agency feed**, validation FAILS immediately.
2. `routes.txt` (**Required**): Route identity (`route_id`), short name (`route_short_name`), long name (`route_long_name`), and route type (`route_type`).
3. `stops.txt` (**Required**): Stop identity (`stop_id`), stop name (`stop_name`), and geographic coordinates (`stop_lat`, `stop_lon`).
4. `trips.txt` (**Required**): Trip identity (`trip_id`), route linkage (`route_id`), service linkage (`service_id`), direction (`direction_id`), optional headsign (`trip_headsign`), and optional shape ID (`shape_id`).
5. `stop_times.txt` (**Required**): Ordered stop visits per trip (`trip_id`, `stop_sequence`, `stop_id`), discrete service-day arrival/departure times (supporting >24h elapsed formats), and timepoint indicators.
   - **Sequence Rule**: `stop_sequence` must strictly increase within the same trip; non-consecutive values (e.g. `1, 23, 40`) are strictly valid.
   - **Deferred Fields**: Known fields (`stop_headsign`, `pickup_type`, `drop_off_type`, `shape_dist_traveled`) are parsed and basic syntax validated, but intentionally not persisted in V1. Their presence is recorded in diagnostics.
6. `calendar.txt` & `calendar_dates.txt` (**Conditionally Required**):
   - **Case A**: Both `calendar.txt` and `calendar_dates.txt` exist.
   - **Case B**: `calendar.txt` is absent, and `calendar_dates.txt` independently defines all active service dates.
   - Cross-file validation verifies `trip.service_id ∈ (Set(calendar.service_id) ∪ Set(calendar_dates.service_id))`.

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
- To eliminate any possibility of **Partial Imports**, Pass 2 persistence runs entirely within a single database transaction (`prisma.$transaction`).
- Because Pass 1 performs 100% pre-validation of all syntax, row schemas, and referential integrity with zero database writes, runtime failures during Pass 2 are restricted to catastrophic database/connection aborts.
- **Contract Guarantee**: If any failure occurs during Pass 2 (e.g. at row 500,001 of `stop_times`), the entire transaction rolls back completely. **Zero partial records or orphaned entities will be left in the database.**

### 2. Strict Idempotency & Conflict Rejection Contract (Mode 1)
- **Definition**: Importing the same feed with the same configuration results in the exact same database state.
- **Identical Payload**: Re-importing a record with the same primary/composite key and identical field values succeeds as an idempotent no-op.
- **Conflicting Payload**: Re-importing a record with the same key but different attribute values triggers an explicit **`IMPORT CONFLICT` error**, aborting the import. Conflicting data is never silently skipped or overwritten.
- **Stale Records**: Mode 1 does not remove records that existed in previous imports but are absent from the current feed. Destructive feed replacement is explicitly deferred to future Mode 2 operations.
- **Driver Data Isolation**: Driver knowledge (`DriverNote`, `HazardAlert`) resides in isolated tables and is never touched, modified, or deleted by GTFS ingestion.

### 3. Memory-Efficient Streaming Contract
- Full dataset arrays (e.g. 500,000 `stop_times` rows) are **NEVER** loaded into memory simultaneously (`no parseAll()`).
- Pass 1 maintains only lightweight identifier sets (`Set<string>`) for foreign reference checks (~5–10 MB RAM total).
- Pass 2 streams records from disk in chunks (e.g. 1,000 rows per batch) directly into transactional batch writes.

## Acceptance Criteria
- [ ] Synthetic minimal GTFS test fixture created in `tests/fixtures/gtfs/` (zero real Translink data committed).
- [ ] Two-Pass streaming ingestion verified: Pass 1 validates syntax, schemas, and cross-file references without database mutations.
- [ ] Cross-file referential integrity enforced: `trip.route_id`, `trip.service_id` (via Service ID Union), `stop_time.trip_id`, and `stop_time.stop_id`.
- [ ] Stop sequence monotonicity verified: non-consecutive increasing values (`1, 23, 40`) PASS; duplicates (`1, 23, 23`) and descending (`1, 40, 23`) FAIL; multi-trip independence PASS.
- [ ] Agency ID conditional validation: single-agency omission PASS with default ID; multi-agency omission FAIL.
- [ ] Conditional calendar ingestion verified for both Case A (`calendar` + `calendar_dates`) and Case B (`calendar_dates` only).
- [ ] Transaction atomicity verified: mid-import failure triggers 100% rollback with zero partial data retained.
- [ ] Strict idempotency verified: identical feed re-import yields zero duplicate records; conflicting payload triggers `IMPORT CONFLICT`.
- [ ] Repository port abstraction verified: Application layer interacts exclusively with `GtfsRepository` interface.
- [ ] Zero runtime dependencies or infrastructure pollution introduced into `src/domain/`.
