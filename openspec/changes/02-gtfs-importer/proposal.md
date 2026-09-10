# Proposal: 02-gtfs-importer

## Summary
Implement a resilient, memory-efficient, and strictly idempotent GTFS data ingestion pipeline for **Bus Route Trainer**. This proposal specifies the infrastructure and application layers required to parse local Translink Queensland GTFS CSV feeds, validate rows, map them into domain models, and persist them to PostgreSQL via Prisma without creating duplicate records or leaving partial imports on failure.

## Ingestion Pipeline Architecture

### Runtime Processing Flow
```
Local GTFS Directory (CSV files)
              ↓
  [RFC-4180 CSV Stream Parser] (raw field preservation, zero trimming)
              ↓
  [GTFS Field Normalizer & Zod Row Validators]
              ↓
  [Domain Entity Mapping (GtfsTime, etc.)]
              ↓
  [Application Ingestion Use Case (Port/Repository)]
              ↓
  [Prisma Batch Upsert (Topologically Ordered)]
              ↓
  [PostgreSQL Persistence]
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
- **Domain**: Has zero dependencies on infrastructure, Prisma, CSV parsers, or Node fs.
- **Application**: Coordinates the import process and defines the `GtfsRepository` interface/port.
- **Infrastructure**: Implements the `GtfsRepository` port with Prisma, executes CSV streaming, and reads the local filesystem.

## Scope: Core GTFS Files Handled (V1)
In full accordance with the official GTFS Schedule specification, the V1 pipeline handles:
1. `agency.txt` (**Required**): Agency ID (`agency_id`), name (`agency_name`), and timezone (`agency_timezone`), mapped to `GtfsAgency`.
2. `routes.txt` (**Required**): Route identity (`route_id`), short name (`route_short_name`), long name (`route_long_name`), and route type (`route_type`).
3. `trips.txt` (**Required**): Trip identity (`trip_id`), route association (`route_id`), service association (`service_id`), direction (`direction_id`), optional headsign (`trip_headsign`), and optional shape ID (`shape_id`).
4. `stops.txt` (**Required**): Stop identity (`stop_id`), stop name (`stop_name`), and geographic coordinates (`stop_lat`, `stop_lon`).
5. `stop_times.txt` (**Required**): Ordered stop visits per trip (`trip_id`, `stop_sequence`, `stop_id`), discrete arrival/departure service times (supporting >24h elapsed formats), and timepoint indicators. Non-consecutive increasing sequences (e.g. `1, 23, 40`) are strictly valid.
6. `calendar.txt` & `calendar_dates.txt` (**Conditionally Required**):
   - **Case A**: Both `calendar.txt` (weekday masks + date ranges) and `calendar_dates.txt` (exception dates) are present.
   - **Case B**: `calendar.txt` is absent, and `calendar_dates.txt` independently defines all individual service dates.
   - The pipeline and persistence model must seamlessly support both cases without failing referential integrity.

*Reserved (Future Scope, deferred to subsequent changes)*:
- `shapes.txt`: Shape polyline coordinates for map drawing (deferred to Change 03 Route Explorer & Map).

## Explicit Non-Goals (Scope Protection for V1)
- ❌ No GTFS-Realtime (GTFS-RT), vehicle positions, live tracking, trip updates, or alerts.
- ❌ No automatic Translink HTTP download, web scraping, or cloud sync. Accepts local directory paths only.
- ❌ No Route Map UI, Route Explorer UI, Quiz UI, or Driver UI.
- ❌ No Spaced Repetition System (SRS) algorithms or review scheduler.
- ❌ No driver authentication, multi-tenant accounts, or cloud IAM.
- ❌ No AI / LLM features.
- ❌ No Full Feed Replacement (atomic wipe of GTFS data); V1 is strictly scoped to Mode 1 (Deterministic Import / Upsert).

## Critical Ingestion Semantics

### 1. Ingestion Mode: Mode 1 (Deterministic Import / Upsert)
- V1 is strictly scoped to **Mode 1**: Importing the identical GTFS feed multiple times guarantees strict idempotency with zero duplicate records, zero primary/composite key collisions, and zero count inflation.
- **Mode 2 (Full Feed Replacement / Atomic Wipe)** is explicitly recognized as a separate, destructive operation and deferred to a future dedicated change. It is NOT part of Change 02 implementation.
- Driver personal data (`DriverNote`, `HazardAlert`) is completely isolated and must never be affected or deleted by GTFS operations.

### 2. Transaction & Failure Safety
- Ingestion executes in topological dependency order (`agency` -> `calendar` / `calendar_dates` -> `routes` -> `stops` -> `trips` -> `stop_times`).
- Database mutations utilize chunked batch writes within Prisma transactional sessions (`prisma.$transaction`).
- Fatal schema or referential failures roll back the batch, preventing partial or corrupted data states.

### 3. Separation of CSV Parsing and GTFS Normalization
- **Generic CSV Parser**: Adheres to RFC-4180. Preserves exact raw field values without automatic trimming (e.g., `" Brisbane Central "` remains `" Brisbane Central "`). Emits `""` for empty fields without blindly converting to `null`.
- **GTFS Field Mapper / Normalizer**: Specific domain/row mappers decide whether an optional blank string becomes `null` or whether a required blank field triggers a validation error.

## Acceptance Criteria
- [ ] Synthetic minimal GTFS fixture created in `tests/fixtures/gtfs/` (zero real Translink data committed).
- [ ] Unit tests verifying CSV stream parsing with escaped quotes (`""`), commas within quotes, UTF-8 BOM, CRLF, and LF.
- [ ] Row validation enforcing required vs optional fields for all 7 handled files (`agency`, `routes`, `stops`, `calendar`, `calendar_dates`, `trips`, `stop_times`).
- [ ] Non-consecutive increasing `stop_sequence` values (e.g. `1, 23, 40`) parsed and preserved without error.
- [ ] Conditional calendar ingestion verified for both Case A (`calendar` + `calendar_dates`) and Case B (`calendar_dates` only).
- [ ] Decoupled repository boundary: Application layer interacts exclusively with a `GtfsRepository` port interface.
- [ ] Re-importing identical feeds results in zero duplicate records across all tables.
- [ ] Zero runtime dependencies or infrastructure pollution introduced into `src/domain/`.
