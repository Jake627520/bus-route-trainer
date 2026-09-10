# Design: 02-gtfs-importer

## Context & Problem Statement
To enable realistic route exploration and active recall training for Queensland bus drivers, the application must ingest official GTFS schedule data from Translink Queensland.

GTFS feeds consist of multiple interrelated CSV files. The ingestion pipeline must:
1. Accurately parse RFC-4180 CSV files without fragile string splitting or unsolicited field mutation (e.g. premature trimming), leveraging the approved community-standard `csv-parse` stream pipeline.
2. Execute a **Two-Pass Streaming Model** that performs 100% pre-validation of syntax, schemas, conditional timing rules, and cross-file references without loading full datasets into RAM.
3. Guarantee **Transaction Atomicity (Option A)** so that any mid-import failure triggers a complete rollback with zero partial data retained, supported by configurable transaction timeouts.
4. Enforce **Strict Idempotency, Duplicate Rejection, and Conflict Detection** (same-feed duplicate PKs trigger `DuplicateFeedRecordError`; conflicting payloads trigger `ImportConflictError`; identical existing records succeed as no-ops).
5. Establish a clean **Single-Agency Fixed-Route Profile** (Translink Queensland), preventing pseudo-multi-agency support and ensuring zero Prisma schema modifications.

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
  │     │     ├── Single-Agency Profile Check: exactly 1 agency required; multi-agency rejected
  │     │     ├── Collects lightweight ID Sets (validAgencyId, validRouteIds, validStopIds, validTripIds, validServiceIds)
  │     │     ├── Verifies route.agency_id -> must match the single validAgencyId if provided
  │     │     ├── Verifies trip.route_id -> validRouteIds & trip.service_id -> ValidServiceIds
  │     │     ├── Verifies stop_time.trip_id -> validTripIds & stop_time.stop_id -> validStopIds
  │     │     ├── Same-Feed Duplicate & Conflict Check:
  │     │     │     ├── Duplicate PK + identical payload -> DuplicateFeedRecordError (REJECT)
  │     │     │     └── Duplicate PK + conflicting payload -> ImportConflictError (REJECT)
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

## 2. GTFS File Requirements & V1 Scope Boundaries

### GTFS Schedule Reference Alignment (2026)
- **`agency.txt`**: **Required** by GTFS specification.
  - Under the V1 profile, the feed must define **exactly one agency** (Translink Queensland).
  - `agency_id`: Conditionally Required by GTFS. If provided, used; if omitted in a single-agency feed, assigned deterministic internal ID (`"DEFAULT_AGENCY"`). Feeds with multiple agencies are rejected with `UnsupportedMultiAgencyFeedError`.
- **`stops.txt`**: **Conditionally Required by GTFS; Required for V1 fixed-route profile**.
  - Omitted in demand-responsive zones defined by `locations.geojson`. Required for fixed-route driver training.
- **`routes.txt`**: **Required** by GTFS specification.
  - `agency_id`: Conditionally Required by GTFS. Optional in single-agency feeds. If provided, Pass 1 validates that it matches `validAgencyId`.
  - *Data Model Integrity*: Because V1 is strictly single-agency, agency context is global to the feed and represented by `GtfsAgency`. `GtfsRoute` does NOT require `agencyId`, guaranteeing **zero Prisma schema modification** in Change 02.
- **`trips.txt`**: **Required** by GTFS specification.
- **`stop_times.txt`**: **Required** by GTFS specification.
- **`calendar.txt` & `calendar_dates.txt`**: **Conditionally Required** by GTFS specification.
  - Case A (`calendar` + `calendar_dates`) and Case B (`calendar_dates` only) both supported.

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
  The atomicity guarantee is independent of timeout value: timeout or error strictly triggers full rollback.

---

## 4. Two-Pass Streaming Execution Model & Memory Boundedness

### Memory Usage Complexity
Full row objects are **NEVER** loaded simultaneously into memory (`no parseAll()`). Memory usage is strictly bounded by:
1. Lightweight cross-file identifier sets (`validAgencyId: string`, `validRouteIds: Set<string>`, `validStopIds: Set<string>`, `validTripIds: Set<string>`, `validServiceIds: Set<string>`).
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
- **Case B (`calendar_dates` only)**: `calendar.txt` is absent; every `service_id` referenced by `trips.txt` must be represented in `calendar_dates.txt`, and service operation is determined exclusively by `exception_type`.

### Cross-File Referential Rules
1. **`routes.agency_id -> validAgencyId`**:
   - Optional in single-agency feed. If provided, must match `validAgencyId`. Mismatches trigger validation failure.
2. **`trip.route_id -> validRouteIds`**: Must exist in `routes.txt`.
3. **`trip.service_id -> ValidServiceIds`**: Must exist in the Service ID Universe.
4. **`stop_time.trip_id -> validTripIds`**: Must exist in `trips.txt`.
5. **`stop_time.stop_id -> validStopIds`**: Must exist in `stops.txt`.

---

## 6. Duplicate, Conflict, and Idempotency Contract

### A. Same-Feed Duplicate & Conflict Rejection
- **Duplicate Primary Key (Same Payload)**: If the incoming feed contains duplicate primary or composite keys with identical payloads, the feed is **REJECTED** with `DuplicateFeedRecordError`. GTFS primary keys must be strictly unique within a feed; producer duplicates are never silently swallowed.
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

## 9. Approved CSV Parser Dependency

In accordance with architectural review:
- **Decision**: Adopt the community-standard package `csv-parse` as an approved runtime dependency.
- **Rationale**: Eliminates the maintenance and edge-case testing burden of building a custom streaming FSM parser, allowing TDD to focus entirely on GTFS domain validation, referential integrity, and atomic batch persistence.
- **Execution**: The package will be installed upon formal `/opsx:apply` authorization, with version resolved directly by npm package manager. No package is installed prior to approval.

---

## 10. Synthetic Test Fixtures
- All automated tests in `tests/fixtures/gtfs/` use synthetically generated minimal GTFS CSVs.
- Zero proprietary Translink data will be committed or downloaded.
- Fixtures explicitly cover:
  - Single-agency profile (valid `agency_id`, omitted `agency_id`) and rejection of multi-agency feeds.
  - Routes matching valid agency ID and routes referencing invalid agency ID.
  - Case A (`calendar` + `calendar_dates`) and Case B (`calendar_dates` only).
  - Same-feed duplicate PK rejection (`DuplicateFeedRecordError`) and same-feed conflict rejection (`ImportConflictError`).
  - Database-level duplicate no-op and conflicting record rejection.
  - `24:10:00` and `25:05:00` service times.
  - Non-consecutive increasing sequences (`1, 10, 25`), duplicate sequences, and descending sequences.
  - `timepoint=1` required timing and first/last stop timing.
  - Quoted fields with commas and escaped quotes (`""`), CRLF line endings, and UTF-8 BOM.
