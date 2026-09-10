# Tasks: 02-gtfs-importer

## TDD Implementation Sequence (RED → GREEN → REFACTOR)

- [ ] Task 01: Create synthetic minimal GTFS test fixture with quotes, CRLF, BOM, non-consecutive sequences (`tests/fixtures/gtfs/`) <!-- id: 02-gi-01 -->
- [ ] Task 02: Write contract tests for RFC-4180 CSV parser verifying raw value preservation and quote escaping (`csv-stream-parser.test.ts`) <!-- id: 02-gi-02 -->
- [ ] Task 03: Implement RFC-4180 streaming CSV parser adhering to contract specifications <!-- id: 02-gi-03 -->
- [ ] Task 04: Write failing tests and implement GTFS CSV header validation and missing file detection <!-- id: 02-gi-04 -->
- [ ] Task 05: Write failing tests and implement `agency.txt` Zod row schema and normalizer <!-- id: 02-gi-05 -->
- [ ] Task 06: Write failing tests and implement `routes.txt` Zod row schema and normalizer <!-- id: 02-gi-06 -->
- [ ] Task 07: Write failing tests and implement `stops.txt` Zod row schema and normalizer <!-- id: 02-gi-07 -->
- [ ] Task 08: Write failing tests and implement `calendar.txt` Zod row schema and normalizer <!-- id: 02-gi-08 -->
- [ ] Task 09: Write failing tests and implement `calendar_dates.txt` row schema supporting independent service dates (Case B) <!-- id: 02-gi-09 -->
- [ ] Task 10: Write failing tests and implement `trips.txt` Zod row schema and nullable optional fields <!-- id: 02-gi-10 -->
- [ ] Task 11: Write failing tests and implement `stop_times.txt` validator verifying non-consecutive sequences (e.g. 1, 23, 40) and >24h times <!-- id: 02-gi-11 -->
- [ ] Task 12: Write failing tests and implement domain model mappers converting validated rows to domain entities <!-- id: 02-gi-12 -->
- [ ] Task 13: Define application repository port interface (`GtfsRepository`) in `src/application/gtfs/` <!-- id: 02-gi-13 -->
- [ ] Task 14: Implement `PrismaGtfsRepository` in `src/infrastructure/gtfs/importer/` adhering to repository port <!-- id: 02-gi-14 -->
- [ ] Task 15: Write failing tests and verify topological batch persistence respecting referential integrity <!-- id: 02-gi-15 -->
- [ ] Task 16: Write failing tests and implement Mode 1 import idempotency (repeated imports result in 0 duplicate records) <!-- id: 02-gi-16 -->
- [ ] Task 17: Write failing tests and verify transactional rollback behavior on batch persistence failures <!-- id: 02-gi-17 -->
- [ ] Task 18: Implement `ImportGtfsUseCase` orchestrating pre-validation, streaming, mapping, and batch persistence <!-- id: 02-gi-18 -->
- [ ] Task 19: Implement standalone CLI runner script (`scripts/import-gtfs.ts`) with argument parsing and summary output <!-- id: 02-gi-19 -->
- [ ] Task 20: Execute end-to-end integration test against local PostgreSQL database using synthetic feed <!-- id: 02-gi-20 -->
- [ ] Task 21: Verify security boundary: confirm zero real Translink GTFS data committed and `.gitignore` remains intact <!-- id: 02-gi-21 -->
