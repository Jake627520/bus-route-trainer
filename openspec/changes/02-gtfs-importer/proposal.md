# Proposal: 02-gtfs-importer

## Summary
Implement a resilient, memory-efficient, and strictly idempotent GTFS data ingestion pipeline for **Bus Route Trainer**. This proposal specifies the infrastructure and application layers required to parse local Translink Queensland GTFS CSV feeds, validate rows, map them into domain entities, and persist them to PostgreSQL via Prisma without creating duplicate records or leaving partial imports on failure.

## Ingestion Pipeline Architecture
```
Local GTFS Directory (CSV files)
              ↓
  [RFC-4180 CSV Stream Parser]
              ↓
  [Raw GTFS Row Validation & Type Coercion]
              ↓
  [Domain Entity Mapping (GtfsTime, etc.)]
              ↓
  [Topologically Ordered Batch Ingestion]
              ↓
  [PostgreSQL via Prisma Upsert / Transaction]
```

## Scope (Files Handled in V1)
1. `routes.txt`: Bus route identity, short names, long names, route types.
2. `trips.txt`: Service trips, route linkages, directions, headsigns, shape linkages.
3. `stops.txt`: Physical bus stop IDs, descriptions/names, latitude, longitude coordinates.
4. `stop_times.txt`: Ordered stops per trip, arrival/departure service times (>24h elapsed strings), timepoint flags.
5. `calendar.txt`: Service operational weekday masks and validity date ranges.
6. `calendar_dates.txt`: Explicit calendar exception dates (Type 1 ADD / Type 2 REMOVE).

*Reserved (Future Scope, deferred)*:
- `agency.txt`: Default agency created or minimally mapped.
- `shapes.txt`: Shape polyline coordinates for map drawing (deferred to Change 03 Map/Route Explorer).

## Explicit Non-Goals (Scope Protection)
- ❌ No GTFS-Realtime (GTFS-RT), live vehicle positions, trip updates, or service alerts.
- ❌ No automatic Translink HTTP downloading, scraping, or cloud sync. Accepts local directory only.
- ❌ No Route Map UI, Route Explorer UI, Quiz UI, or Driver UI.
- ❌ No Spaced Repetition System (SRS) calculations or review scheduler.
- ❌ No driver authentication, multi-tenant accounts, or cloud IAM.
- ❌ No AI / LLM features.

## Critical Requirements

### 1. Strict Ingestion Idempotency
Importing the identical GTFS feed multiple times (e.g. repeated runs or re-imports) must guarantee:
- Zero duplicate records across all tables (`GtfsRoute`, `GtfsTrip`, `GtfsStop`, `GtfsStopTime`, `GtfsCalendar`, `GtfsCalendarDate`).
- No primary key or composite unique key collisions.
- No artificial counter inflation or dangling relationships.

### 2. Transaction & Failure Safety
- Ingestion must follow strict foreign key dependency order (`GtfsCalendar` -> `GtfsRoute` -> `GtfsStop` -> `GtfsTrip` -> `GtfsStopTime` -> `GtfsCalendarDate`).
- Any fatal schema or foreign-key integrity failure during ingestion must roll back or prevent partial orphaned records from leaving the database in an inconsistent state.

### 3. CSV Parsing Robustness
- Must properly handle RFC 4180 rules: escaped quotes (`""`), commas within quoted fields, UTF-8 with/without BOM, CRLF (`\r\n`) and LF (`\n`), whitespace trimming, and optional GTFS columns.
- Must never use naïve `line.split(',')`.

## Acceptance Criteria
- [ ] Comprehensive unit tests verifying CSV stream parsing with complex quoted strings and CRLF.
- [ ] Validation tests rejecting corrupt or missing mandatory GTFS fields.
- [ ] Foreign-key dependency order respected during persistence.
- [ ] Repeated import test fixture demonstrating 100% idempotency with zero duplicate records.
- [ ] Zero runtime pollution of the core domain layer (`src/domain/`).
