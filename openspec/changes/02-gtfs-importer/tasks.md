# Tasks: 02-gtfs-importer

## TDD Implementation Sequence (RED → GREEN → REFACTOR)

- [ ] Task 01: Create synthetic minimal GTFS test fixture with quotes, CRLF, BOM, non-consecutive sequences, and Case A/B schedules (`tests/fixtures/gtfs/`) <!-- id: 02-gi-01 -->
- [ ] Task 02: Write contract tests for RFC-4180 CSV parser verifying raw value preservation, quote escaping, and empty string emission (`csv-stream-parser.test.ts`) <!-- id: 02-gi-02 -->
- [ ] Task 03: Implement RFC-4180 streaming CSV parser adhering to contract specifications <!-- id: 02-gi-03 -->
- [ ] Task 04: Write failing tests and implement `agency.txt` conditional validation (single-agency omission vs multi-agency error) <!-- id: 02-gi-04 -->
- [ ] Task 05: Write failing tests and implement `routes.txt` Zod row schema and field normalizer <!-- id: 02-gi-05 -->
- [ ] Task 06: Write failing tests and implement `stops.txt` Zod row schema and field normalizer <!-- id: 02-gi-06 -->
- [ ] Task 07: Write failing tests and implement `calendar.txt` Zod row schema and field normalizer <!-- id: 02-gi-07 -->
- [ ] Task 08: Write failing tests and implement `calendar_dates.txt` row schema supporting independent service dates (Case B) <!-- id: 02-gi-08 -->
- [ ] Task 09: Write failing tests and implement `trips.txt` Zod row schema and nullable optional fields <!-- id: 02-gi-09 -->
- [ ] Task 10: Write failing tests and implement `stop_times.txt` schema validator verifying >24h `GtfsTime` strings and deferred field tracking <!-- id: 02-gi-10 -->
- [ ] Task 11: Write failing tests and implement `stop_sequence` monotonicity validator (non-consecutive `1, 23, 40` PASS; duplicate `1, 23, 23` FAIL; descending `1, 40, 23` FAIL; multi-trip independence PASS) <!-- id: 02-gi-11 -->
- [ ] Task 12: Write failing tests and implement Pass 1 Cross-File Referential Validator with Service ID Union (`trip -> route`, `trip -> service union`, `stop_time -> trip/stop`) <!-- id: 02-gi-12 -->
- [ ] Task 13: Define application repository port interface (`GtfsRepository`, `GtfsTransactionalRepository`) in `src/application/gtfs/` <!-- id: 02-gi-13 -->
- [ ] Task 14: Implement `PrismaGtfsRepository` in `src/infrastructure/gtfs/importer/` adhering to repository port <!-- id: 02-gi-14 -->
- [ ] Task 15: Write failing tests and implement strict conflict detection (identical payload succeeds; conflicting payload triggers `ImportConflictError`) <!-- id: 02-gi-15 -->
- [ ] Task 16: Write failing tests and implement Pass 2 topological batch persistence in single transaction (Option A) <!-- id: 02-gi-16 -->
- [ ] Task 17: Write failing test verifying transaction atomicity (mid-import error at row 500,001 triggers 100% rollback with zero partial records retained) <!-- id: 02-gi-17 -->
- [ ] Task 18: Implement `ImportGtfsUseCase` orchestrating Pass 1 streaming validation and Pass 2 atomic persistence <!-- id: 02-gi-18 -->
- [ ] Task 19: Implement standalone CLI runner script (`scripts/import-gtfs.ts`) with diagnostic summary output <!-- id: 02-gi-19 -->
- [ ] Task 20: Execute end-to-end integration test against local PostgreSQL database using synthetic feed <!-- id: 02-gi-20 -->
- [ ] Task 21: Verify security boundary: confirm zero real Translink GTFS data committed and `.gitignore` remains intact <!-- id: 02-gi-21 -->
