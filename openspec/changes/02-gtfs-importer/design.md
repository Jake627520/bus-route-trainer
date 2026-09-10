# Design: 02-gtfs-importer

## Context & Problem Statement
To enable realistic route exploration and active recall training for Queensland bus drivers, the application must ingest official GTFS schedule data from Translink Queensland. 

GTFS feeds consist of multiple interrelated CSV files. The ingestion pipeline must:
1. Accurately parse RFC-4180 CSV files without fragile string splitting or unwanted data mutation (e.g. unsolicited trimming).
2. Faithfully represent GTFS specifications, including conditionally required calendar services and non-consecutive stop sequences.
3. Decouple application use cases from database drivers via repository ports.
4. Guarantee atomic batch transactions and idempotent re-runs without mutating or deleting driver notes.

---

## 1. System Architecture & Boundaries

### Runtime Processing Flow
```text
GTFS Directory (CSV files)
        ↓
Infrastructure: CSV Stream Parser (raw strings, RFC-4180 compliant)
        ↓
Infrastructure: GTFS Field Normalizers & Row Validators (Zod schemas)
        ↓
Application: Import GTFS Use Case (Orchestrates topological ingestion)
        ↓
Domain: Value Objects & Aggregate Verification (GtfsTime, StopSequence)
        ↓
Infrastructure: PrismaGtfsRepository (Implements Application Port)
        ↓
PostgreSQL Database
```

### Compile-Time Dependency Rules
```text
   ┌────────────────────────────────────────────────────────┐
   │                      Domain Layer                      │
   │  - Pure TypeScript domain models                       │
   │  - NO dependencies on Application or Infrastructure    │
   └───────────────────────────▲────────────────────────────┘
                               │ depends on
   ┌───────────────────────────┴────────────────────────────┐
   │                   Application Layer                    │
   │  - Ingestion Use Cases (import-gtfs-use-case.ts)       │
   │  - Port Definition: GtfsRepository interface           │
   │  - NO dependencies on PrismaClient or Node fs          │
   └───────────────────────────▲────────────────────────────┘
                               │ implements / depends on
   ┌───────────────────────────┴────────────────────────────┐
   │                  Infrastructure Layer                  │
   │  - CSV Stream Parser (csv-stream-parser.ts)            │
   │  - Row Schemas & Normalizers (gtfs-row-schemas.ts)     │
   │  - Repository Adapter: PrismaGtfsRepository            │
   │  - Prisma Client & Node filesystem access               │
   └────────────────────────────────────────────────────────┘
```

---

## 2. Port & Repository Boundary

To ensure the application use case remains decoupled from Prisma, the application layer defines a repository port interface:

```typescript
// src/application/gtfs/gtfs-repository.port.ts
export interface GtfsRepository {
  saveAgencies(agencies: GtfsAgencyRow[]): Promise<number>;
  saveCalendars(calendars: GtfsCalendarRow[]): Promise<number>;
  saveCalendarDates(calendarDates: GtfsCalendarDateRow[]): Promise<number>;
  saveRoutes(routes: GtfsRouteRow[]): Promise<number>;
  saveStops(stops: GtfsStopRow[]): Promise<number>;
  saveTrips(trips: GtfsTripRow[]): Promise<number>;
  saveStopTimes(stopTimes: GtfsStopTimeRow[]): Promise<number>;
}
```

The concrete implementation (`PrismaGtfsRepository`) resides in `src/infrastructure/gtfs/importer/prisma-gtfs-repository.ts`. The application use case depends strictly on the `GtfsRepository` interface.

---

## 3. Agency Scope Integration
In accordance with GTFS specification where `agency.txt` is Required:
- File: `agency.txt`
- Target Model: `GtfsAgency`
- Fields mapped:
  - `agency_id` -> `GtfsAgency.id` (String @id)
  - `agency_name` -> `GtfsAgency.name` (String)
  - `agency_timezone` -> `GtfsAgency.timezone` (String)
- In the rare event that a single-agency GTFS feed omits `agency_id`, the normalizer maps to a deterministic default (e.g. `"DEFAULT_AGENCY"`).

---

## 4. Calendar & CalendarDate Conditional Semantics

GTFS Schedule permits two valid methods to define service availability:
- **Case A (`calendar.txt` + optional `calendar_dates.txt`)**: Regular service is established by weekday boolean flags over a date range in `calendar.txt`, modified by specific holiday or special run exceptions in `calendar_dates.txt`.
- **Case B (`calendar_dates.txt` only, `calendar.txt` absent)**: Every operating service date is enumerated explicitly in `calendar_dates.txt`.

### Referential Integrity Design
- `GtfsCalendarDate` composite identity is `@@id([serviceId, date])` with `@@index([serviceId])`.
- In our Prisma schema, `GtfsCalendarDate.serviceId` is an indexed string identifier and does **NOT** enforce an explicit database foreign key to `GtfsCalendar.serviceId`.
- `GtfsTrip.serviceId` is an indexed string attribute referencing the service identifier without a hard foreign key constraint.
- **Architectural Verification**: This decoupled model natively accommodates both Case A and Case B without constraint violations or schema modifications.

---

## 5. CSV Parsing Layer vs GTFS Field Normalization

A strict distinction is maintained between generic CSV parsing and GTFS field mapping:

### A. Generic CSV Parser (RFC 4180 Compliant)
- **Zero Automatic Trimming**: Preserves raw field characters. `" Brisbane Central "` remains `" Brisbane Central "`.
- **Empty String Preservation**: Fields with no content between delimiters emit empty strings `""`, not `null`.
- **Delimiters & Quotes**: Handles commas within quotes (`"St Lucia, Brisbane"`), escaped double quotes (`""`), and preserves newlines inside quoted fields.
- **Line Endings & Encoding**: Seamlessly supports both Windows CRLF (`\r\n`) and Unix LF (`\n`). Strips UTF-8 BOM (`\uFEFF`) from the initial stream header.

### B. GTFS Field Normalizer & Validator (Zod)
- **Optional String Fields**: Evaluates raw empty string `""` -> `null`.
- **Required String Fields**: Evaluates raw empty string `""` -> triggers validation error.
- **Whitespaces**: Trimming is explicitly managed per field specification where leading/trailing whitespace is proven to be non-semantic.

---

## 6. CSV Parser Dependency Evaluation: `DEPENDENCY DECISION REQUIRED`

### Option 1: Zero-Dependency Custom RFC-4180 Parser
- **Description**: A dedicated streaming state-machine parser implemented in `src/infrastructure/gtfs/parser/csv-stream-parser.ts` using Node.js stream transforms.
- **Pros**:
  - Zero external npm packages added to `package.json`.
  - Full control over error reporting, chunk boundary handling, and performance tuning.
- **Cons**:
  - Requires comprehensive test suite covering multi-chunk boundaries with embedded quotes and CRLF.
  - Ongoing maintenance overhead within the project.

### Option 2: Community Standard Package (`csv-parse`)
- **Description**: Add `csv-parse` (`^5.6.0`) to `package.json`.
- **Pros**:
  - Battle-tested on billions of CSV rows; complete edge-case handling out of the box.
  - Native Node.js stream pipeline integration.
- **Cons**:
  - Introduces external runtime dependency.
  - Increases supply-chain footprint.

**Status**: Marked as **`DEPENDENCY DECISION REQUIRED`**. Implementation remains **NOT STARTED** awaiting human approval.

---

## 7. Import Modes & Idempotency Strategy

### Mode 1: Deterministic Import / Upsert (V1 Scope)
- **Objective**: Ingest a GTFS directory such that repeated runs against the same or overlapping feed produce identical database states with zero duplicate records and no primary/composite key collisions.
- **Implementation**:
  - Entities with primary keys (`GtfsAgency`, `GtfsRoute`, `GtfsStop`, `GtfsTrip`, `GtfsCalendar`) use upsert or chunked `createMany({ skipDuplicates: true })`.
  - Entities with composite keys (`GtfsStopTime`, `GtfsCalendarDate`) use composite index resolution.
- **Limitation**: Does not delete records that were present in previous imports but absent in the new feed.

### Mode 2: Full Feed Replacement (Future Scope, NOT in V1)
- **Objective**: Atomically wipe existing GTFS datasets and replace them with a new feed release.
- **Safety Boundary**: Must strictly guarantee that driver personal knowledge (`DriverNote`, `HazardAlert`) and future SRS cards are **NEVER** deleted. GTFS tables can be purged in reverse topological order, but driver tables remain completely untouched.
- **V1 Action**: Mode 2 is explicitly deferred to a dedicated future change.

---

## 8. Transaction Safety & Batching Strategy

GTFS datasets can contain tens of thousands of rows (especially `stop_times.txt`). Placing the entire import into a single monolithic interactive transaction causes memory pressure and connection timeouts.

### Ingestion Strategy
1. **Pre-Validation**: All CSV files in the target directory are checked for presence of mandatory headers and basic row schema validity before initiating database mutations.
2. **Topological Order**:
   - Level 0: `GtfsAgency`, `GtfsRoute`, `GtfsStop`, `GtfsCalendar`
   - Level 1: `GtfsCalendarDate`
   - Level 2: `GtfsTrip` (references `routeId`)
   - Level 3: `GtfsStopTime` (references `tripId`, `stopId`)
3. **Chunked Batches**: Large tables (e.g. `stop_times`) are ingested in chunked batches (e.g. 1,000 rows per batch) inside short-lived Prisma transactions (`prisma.$transaction`).
4. **Failure Isolation**: An unrecoverable failure in a batch halts processing and reports exact file and row error diagnostics.

---

## 9. Stop Times Field Categorisation & Sequence Semantics

### Field Categorisation in `stop_times.txt`
- **Persist Now (V1 Domain & Persistence)**:
  - `trip_id`: Trip association.
  - `stop_sequence`: Order indicator (must be non-negative integer; must strictly increase; **does NOT require consecutive numbering**).
  - `stop_id`: Stop reference.
  - `arrival_time`: Service-day elapsed time string (e.g. `24:10:00`, nullable).
  - `departure_time`: Service-day elapsed time string (nullable).
  - `timepoint`: Exact timing point indicator (1 = exact, 0 = approximate, defaults to 1).
- **Parse & Validate but Defer Persistence (V2 Candidates)**:
  - `stop_headsign`: Per-stop headsign overrides.
  - `pickup_type`, `drop_off_type`: Boarding restrictions.
  - `shape_dist_traveled`: Distance along trip shape.
- **Unsupported / Rejected**:
  - Realtime trip update extensions and frequency-based continuous stop times.

### Stop Sequence Non-Consecutive Rule
- The GTFS specification requires `stop_sequence` to increase along the trip, but does not require consecutive numbers (e.g. sequences `1, 23, 40` are completely valid).
- The importer strictly validates `s[i].stopSequence < s[i+1].stopSequence` and **NEVER** enforces `s[i+1] === s[i] + 1`.

---

## 10. Synthetic Test Fixtures
To guarantee strict compliance with data licensing and prevent leakage of proprietary/raw Translink archives:
- All automated tests in `tests/fixtures/gtfs/` use **synthetically generated minimal GTFS files**.
- Real Translink raw data archives will **NEVER** be downloaded or committed to the repository.
- Synthetic fixtures will explicitly include:
  - `24:10:00` and `25:05:00` GTFS service times.
  - Quoted fields containing commas and quotes (`""`).
  - Windows CRLF line breaks.
  - UTF-8 BOM headers.
  - Non-consecutive stop sequences (`1, 10, 25`).
  - Blank optional fields.
