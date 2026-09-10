# Tasks: 02-gtfs-importer

## TDD Implementation Sequence (RED → GREEN → REFACTOR)

- [x] Task 01: Create synthetic minimal GTFS test fixtures covering single-agency, multi-agency rejection, invalid agency refs, Case A/B calendars, non-consecutive sequences, >24h times, and same-feed duplicate records (`tests/fixtures/gtfs/`) <!-- id: 02-gi-01 -->
- [x] Task 02: Write contract tests for CSV stream parser verifying raw value preservation, quote escaping, CRLF/BOM handling, and empty string emission (`csv-stream-parser.test.ts`) <!-- id: 02-gi-02 -->
- [x] Task 03: Install approved `csv-parse` dependency and implement CSV stream parser adapter adhering to contract specifications <!-- id: 02-gi-03 -->
- [x] Task 04: Write failing tests and implement `agency.txt` Single-Agency Profile enforcement (single agency allowed with optional `agency_id`; multi-agency feed rejected with `UnsupportedMultiAgencyFeedError`) <!-- id: 02-gi-04 -->
- [x] Task 05: Write failing tests and implement `routes.txt` Zod row schema and `routes.agency_id` single-agency referential validation <!-- id: 02-gi-05 -->
- [x] Task 06: Write failing tests and implement `stops.txt` Zod row schema (Required for V1 fixed-route profile) <!-- id: 02-gi-06 -->
- [x] Task 07: Write failing tests and implement `calendar.txt` Zod row schema and field normalizer <!-- id: 02-gi-07 -->
- [x] Task 08: Write failing tests and implement `calendar_dates.txt` row schema supporting independent service dates (Case B) <!-- id: 02-gi-08 -->
- [x] Task 09: Write failing tests and implement `trips.txt` Zod row schema and nullable optional fields <!-- id: 02-gi-09 -->
- [x] Task 10: Write failing tests and implement `stop_times.txt` schema validator verifying >24h `GtfsTime` strings, `timepoint=1` required timing, and first/last stop timing rules <!-- id: 02-gi-10 -->
- [x] Task 11: Write failing tests and implement `stop_sequence` monotonicity validator (non-consecutive `1, 23, 40` PASS; duplicate `1, 23, 23` FAIL; descending `1, 40, 23` FAIL; multi-trip independence PASS) <!-- id: 02-gi-11 -->
- [x] Task 12: Write failing tests and implement `stop_times.txt` deferred fields syntax validation and diagnostic tracking (`stop_headsign`, `pickup_type`, `drop_off_type`, `shape_dist_traveled`) <!-- id: 02-gi-12 -->
- [x] Task 13: Write failing tests and implement Pass 1 Cross-File Referential Validator with Service ID Union (`route -> agency`, `trip -> route`, `trip -> service union`, `stop_time -> trip/stop`) <!-- id: 02-gi-13 -->
- [x] Task 14: Write failing tests and implement same-feed duplicate PK rejection (`DuplicateFeedRecordError`) and same-feed conflicting payload detection (`ImportConflictError`) <!-- id: 02-gi-14 -->
- [x] Task 15: Define typed application repository port interfaces (`GtfsRepository`, `GtfsTransactionalRepository`) in `src/application/gtfs/` (no generic table strings) <!-- id: 02-gi-15 -->
- [x] Task 16: Implement `PrismaGtfsRepository` in `src/infrastructure/gtfs/importer/` with identical payload idempotency and database conflict detection <!-- id: 02-gi-16 -->
- [x] Task 17: Write failing tests and implement Option A single transaction persistence with configurable timeout and full rollback on error <!-- id: 02-gi-17 -->
- [x] Task 18: Implement `ImportGtfsUseCase` orchestrating Pass 1 streaming validation and Pass 2 atomic persistence <!-- id: 02-gi-18 -->
- [x] Task 19: Implement standalone CLI runner script (`scripts/import-gtfs.ts`) with diagnostic summary output <!-- id: 02-gi-19 -->
- [x] Task 20: Execute end-to-end integration test against local PostgreSQL database using synthetic feed <!-- id: 02-gi-20 -->
- [x] Task 21: Verify security boundary: confirm zero real Translink GTFS data committed and `.gitignore` remains intact <!-- id: 02-gi-21 -->
