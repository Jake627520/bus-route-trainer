# Design: 02-gtfs-importer

## Context & Problem Statement
To enable realistic route exploration and active recall training for Queensland bus drivers, the application must ingest official GTFS schedule data from Translink Queensland. 

GTFS feeds consist of multiple interrelated CSV files. The ingestion pipeline must:
1. Accurately parse RFC-4180 CSV files without fragile string splitting or unsolicited field mutation (e.g. premature trimming).
2. Execute a **Two-Pass Streaming Model** that performs 100% pre-validation of syntax, schemas, conditional timing rules, and cross-file references without loading full datasets into RAM.
3. Guarantee **Transaction Atomicity (Option A)** so that any mid-import failure triggers a complete rollback with zero partial data retained, supported by configurable transaction timeouts.
4. Enforce **Strict Idempotency, Duplicate Rejection, and Conflict Detection** (same-feed duplicates and conflicting payloads trigger explicit errors; identical existing records succeed as no-ops).
5. Maintain clean architectural boundaries decoupling domain and application use cases from database drivers via strongly-typed repository ports.

---

## 1. System Architecture & Boundaries

### Runtime Processing Flow (Two-Pass Streaming Model)
```text
GTFS Directory (CSV files on disk)
  │
  ├───► PASS 1: Streaming Validation Pass (Zero DB Mutations)
  │     ├── Infrastructure: CSV Stream Parser (raw strings, RFC-4180 compliant)
  │     ├── Infrastructure: GTFS Field Normalizers & Row Validators (Zod schemas)
  │     ├── Application: Cross-File Referential Validator
  │     │     ├── Collects lightweight ID Sets (validAgencyIds, validRouteIds, validStopIds, validTripIds, validServiceIds)
  │     │     ├── Verifies route.agency_id -> validAgencyIds (required for multi-agency, optional for single-agency)
  │     │     ├── Verifies trip.route_id -> validRouteIds & trip.service_id -> ValidServiceIds
  │     │     ├── Verifies stop_time.trip_id -> validTripIds & stop_time.stop_id -> validStopIds
  │     │     ├── Rejects duplicate primary keys within the incoming feed
  │     │     ├── Verifies stop_sequence monotonicity (strictly increasing per trip)
  │     │     └── Verifies GTFS conditional timing rules (timepoint=1 and first/last stop timing requirements)
  │     └── Result: Validation Report (PASS -> proceed to Pass 2; FAIL -> abort immediately)
  │
  └───► PASS 2: Streaming Persistence Pass (Single Atomic Transaction)
        ├── Infrastructure: Re-read local CSV files from disk via stream parser
        ├── Application: ImportGtfsUseCase opens transaction via GtfsRepository port
        ├── Infrastructure: PrismaGtfsRepository executes chunked batch upserts
        ├── Strict Database Idempotency Check: identical payload allowed, conflicting payload rejected
        └── Result: COMMIT on success (zero partial import) or ROLLBACK on abort
```

### Compile-Time Dependency Rules
```text
   ┌────────────────────────────────────────────────────────┐
   │                      Domain Layer                      │
   │  - Pure TypeScript domain models                       │
   │  - Value Objects (GtfsTime) & Aggregates (StopSequence)│
   │  - ZERO dependencies on Application or Infrastructure  │
   └───────────────────────────▲────────────────────────────┘
                               │ depends on
   ┌───────────────────────────┴────────────────────────────┐
   │                   Application Layer                    │
   │  - Ingestion Use Cases (import-gtfs-use-case.ts)       │
   │  - Cross-File Validation Service                       │
   │  - Port Definition: GtfsRepository typed interface     │
   │  - ZERO dependencies on PrismaClient or Node fs        │
   └───────────────────────────▲────────────────────────────┘
                               │ implements / depends on
   ┌───────────────────────────┴────────────────────────────┐
   │                  Infrastructure Layer                  │
   │  - CSV Stream Parser (csv-stream-parser.ts)            │
   │  - Row Schemas & Normalizers (gtfs-row-schemas.ts)     │
   │  - Repository Adapter: PrismaGtfsRepository            │
   │  - Prisma Client & Node filesystem access              │
   └────────────────────────────────────────────────────────┘
```

---

## 2. GTFS File Requirements & Scope Definitions (2026 Reference Alignment)

In strict accordance with the official GTFS Schedule Reference:
- **`agency.txt`**: **Required** by GTFS specification.
  - `agency_id`: **Conditionally Required**. Required if the feed contains multiple agencies; optional if single-agency. In single-agency feeds omitting `agency_id`, V1 assigns a deterministic internal ID (`"DEFAULT_AGENCY"`). Multi-agency feeds with missing `agency_id` are rejected.
- **`stops.txt`**: **Conditionally Required by GTFS; Required for V1 fixed-route profile**.
  - GTFS specification defines `stops.txt` as Conditionally Required (e.g. omitted in demand-responsive zones defined by `locations.geojson`).
  - For this application's fixed-route driver memory trainer profile, `stops.txt` is **Required**.
- **`routes.txt`**: **Required** by GTFS specification.
  - `agency_id`: **Conditionally Required**. Required in multi-agency feeds; optional in single-agency feeds.
- **`trips.txt`**: **Required** by GTFS specification.
- **`stop_times.txt`**: **Required** by GTFS specification.
- **`calendar.txt` & `calendar_dates.txt`**: **Conditionally Required** by GTFS specification.
  - At least one must be provided to define service operation. Either `calendar.txt` alone, or both, or `calendar_dates.txt` alone (Case B).

---

## 3. Transaction Atomicity Strategy: Option A (Single Transaction)

### Strategy Specification
- **Execution**: Pass 1 ensures 100% data and referential validity before database mutation begins. Pass 2 executes within a single interactive transaction `prisma.$transaction(async (tx) => { ... }, { timeout, maxWait })` using chunked batch writes (`createMany`).
- **Guarantee**: If any failure occurs (e.g. connection timeout at row 500,001 of `stop_times`), PostgreSQL rolls back the entire transaction. **Zero partial import is retained.**
- **Configurable Timeout**:
  ```typescript
  export interface ImportGtfsOptions {
    transactionTimeoutMs?: number; // Default: 120000 ms (2 mins) for local dev
    transactionMaxWaitMs?: number; // Default: 10000 ms
    batchSize?: number;           // Default: 1000 rows
  }
  ```
  The atomicity contract is independent of the timeout value: whether aborted by timeout or data error, full rollback is strictly guaranteed.

---

## 4. Two-Pass Streaming Execution Model & Memory Boundedness

To reconcile **complete pre-validation** with **low memory consumption**, the pipeline operates in two streaming passes over local disk files:

### Memory Usage Complexity
Full row objects are **NEVER** loaded simultaneously into memory (`no parseAll()`). Memory usage is strictly bounded by:
1. Lightweight cross-file identifier indexes (`validAgencyIds`, `validRouteIds`, `validStopIds`, `validTripIds`, `validServiceIds`).
2. Per-trip active sequence state (`Map<string, number>` tracking `lastStopSequence`).
3. Current persistence chunk buffer (default 1,000 rows).

Memory does not scale with the full row payload, but with the count of unique identifiers required for referential validation. For 50,000 trips and stops, identifier sets consume <10 MB of RAM.

---

## 5. Application-Level Referential Integrity & Service ID Universe

### Service ID Universe
```text
ValidServiceIds = Set(calendar.service_id) ∪ Set(calendar_dates.service_id)
```
- **Case A (`calendar` + `calendar_dates`)**: `ValidServiceIds` is the union of regular and exception service identifiers.
- **Case B (`calendar_dates` only)**: `calendar.txt` is absent; `ValidServiceIds` is derived entirely from `calendar_dates.service_id`.

### Cross-File Referential Rules
1. **`routes.agency_id -> validAgencyIds`**:
   - Multi-agency feed: `routes.agency_id` is mandatory and must exist in `validAgencyIds`.
   - Single-agency feed: `routes.agency_id` is optional; if present, it must exist in `validAgencyIds`.
   - *Schema Check*: `GtfsRoute` currently models `id`, `shortName`, `longName`, `routeType`. In V1, `routes.agency_id` is validated in Pass 1 for integrity; persistence of `agencyId` on `GtfsRoute` is deferred if multi-agency filtering is not required in V1, ensuring NO Prisma schema change is needed in Change 02.
2. **`trip.route_id -> validRouteIds`**: Must exist in `routes.txt`.
3. **`trip.service_id -> ValidServiceIds`**: Must exist in the Service ID Universe.
4. **`stop_time.trip_id -> validTripIds`**: Must exist in `trips.txt`.
5. **`stop_time.stop_id -> validStopIds`**: Must exist in `stops.txt`.

---

## 6. Duplicate, Conflict, and Idempotency Contract

### A. Same-Feed Duplicate & Conflict Rejection
- **Duplicate Primary Key**: If the incoming feed contains duplicate primary or composite keys (e.g. multiple `route_id=100` or duplicate `(trip_id, stop_sequence)`), the feed is **REJECTED immediately**. Importers must never silently swallow producer duplicate rows.
- **Conflicting Payload**: Duplicate keys with differing attributes in the same feed trigger an immediate **`ImportConflictError`**.

### B. Database-Level Idempotency & Conflict Detection
When incoming rows are compared against existing database records:
- **Identical Payload**: If an incoming record matches an existing record's primary key and has identical attributes, it is accepted as an idempotent no-op.
- **Conflicting Payload**: If an incoming record matches an existing primary key but contains different attribute values, the importer triggers an **`ImportConflictError`** and halts ingestion. Conflicting data is never silently overwritten.

### C. Deferred Fields in Conflict Identity
- Conflict comparison compares **only persisted V1 fields**.
- Deferred fields (`stop_headsign`, `pickup_type`, `drop_off_type`, `shape_dist_traveled`) are parsed and validated for syntax, but differences in deferred fields between incoming rows and DB records do NOT trigger a DB conflict error.
- Within the same incoming feed, primary key uniqueness `(trip_id, stop_sequence)` is strictly enforced regardless of deferred field values.

### D. Stale Records & Driver Data Safety
- Mode 1 does not remove records absent from the current feed. Destructive feed replacement is deferred to future Mode 2.
- Driver knowledge (`DriverNote`, `HazardAlert`) resides in isolated tables and is **NEVER** modified or deleted by GTFS operations.

---

## 7. Stop Times Timing Rules & Sequence Monotonicity

### Stop Sequence Monotonicity
- Must be non-negative integer.
- Must strictly increase per trip (`s[i] < s[i+1]`). Non-consecutive values (`1, 23, 40`) are strictly valid.
- Duplicate sequence in same trip (`1, 23, 23`) -> FAIL (`DuplicateStopSequenceError`).
- Descending sequence in same trip (`1, 40, 23`) -> FAIL (`NonMonotonicStopSequenceError`).
- Multi-trip independence (`T1: [1, 23, 40]` and `T2: [1, 5, 9]`) -> PASS.

### Conditional Timing Rules
- Post-midnight service times (`24:10:00`, `25:05:00`) are strictly valid.
- `timepoint = 1`: Both `arrival_time` and `departure_time` are required. Missing times when `timepoint=1` triggers validation failure.
- First stop of a trip: Missing `departure_time` triggers validation failure.
- Last stop of a trip: Missing `arrival_time` triggers validation failure.
- Intermediate stops with `timepoint = 0`: May omit arrival and departure times (interpolated stops).

---

## 8. Strongly-Typed Repository Port Interface

To avoid dynamic table-string access and prevent injection risks:

```typescript
// src/application/gtfs/gtfs-repository.port.ts
export interface GtfsRepository {
  executeInTransaction<T>(
    work: (repo: GtfsTransactionalRepository) => Promise<T>,
    options?: { timeoutMs?: number; maxWaitMs?: number }
  ): Promise<T>;
}

export interface GtfsTransactionalRepository {
  saveAgencies(agencies: GtfsAgencyRow[]): Promise<number>;
  saveCalendars(calendars: GtfsCalendarRow[]): Promise<number>;
  saveCalendarDates(calendarDates: GtfsCalendarDateRow[]): Promise<number>;
  saveRoutes(routes: GtfsRouteRow[]): Promise<number>;
  saveStops(stops: GtfsStopRow[]): Promise<number>;
  saveTrips(trips: GtfsTripRow[]): Promise<number>;
  saveStopTimes(stopTimes: GtfsStopTimeRow[]): Promise<number>;

  findAgencyById(id: string): Promise<GtfsAgencyRow | null>;
  findRouteById(id: string): Promise<GtfsRouteRow | null>;
  findStopById(id: string): Promise<GtfsStopRow | null>;
  findTripById(id: string): Promise<GtfsTripRow | null>;
  findStopTimeByKey(tripId: string, stopSequence: number): Promise<GtfsStopTimeRow | null>;
  findCalendarById(serviceId: string): Promise<GtfsCalendarRow | null>;
  findCalendarDateByKey(serviceId: string, date: string): Promise<GtfsCalendarDateRow | null>;
}
```

The concrete adapter (`PrismaGtfsRepository`) implements this interface. The Application layer never passes dynamic table strings.

---

## 9. CSV Parser Dependency Decision

### Evaluation
- **Option 1 (Zero-Dependency Custom RFC-4180 Streaming Parser)**:
  - Requires maintaining custom FSM handling multi-chunk boundaries with embedded quotes, CRLF, BOM, and escaped characters.
- **Option 2 (Community Standard Package: `csv-parse ^5.6.0`, RECOMMENDED)**:
  - Battle-tested on billions of CSV rows; native Node.js stream pipeline integration. Allows engineering effort to focus entirely on GTFS validation and referential integrity rather than reinventing CSV parsing.

**Status**: User explicitly recommends **Option 2 (`csv-parse`)**. Marked ready for formal authorization upon `/opsx:apply`. No package installed prior to approval.

---

## 10. Synthetic Test Fixtures
- All automated tests in `tests/fixtures/gtfs/` use synthetically generated minimal GTFS CSVs.
- Zero proprietary Translink data will be committed or downloaded.
- Fixtures explicitly cover:
  - Multi-agency and single-agency feeds (with valid, missing, and invalid `agency_id`).
  - Routes referencing valid and invalid agency IDs.
  - Case A (`calendar` + `calendar_dates`) and Case B (`calendar_dates` only).
  - Same-feed duplicate and conflicting records.
  - Database-level duplicate and conflicting records.
  - `24:10:00` and `25:05:00` service times.
  - Non-consecutive increasing sequences (`1, 10, 25`), duplicate sequences, and descending sequences.
  - `timepoint=1` required timing and first/last stop timing.
  - Quoted fields with commas and escaped quotes (`""`), CRLF line endings, and UTF-8 BOM.
