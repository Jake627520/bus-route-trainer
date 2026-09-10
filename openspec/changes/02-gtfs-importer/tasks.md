# Tasks: 02-gtfs-importer

## TDD Implementation Sequence (RED → GREEN → REFACTOR)

- [ ] Task 1: Create minimal Translink GTFS test fixtures with quotes, commas, and CRLF (`tests/fixtures/gtfs/`) <!-- id: 02-gi-01 -->
- [ ] Task 2: Write failing tests for RFC-4180 CSV streaming parser (`csv-stream-parser.test.ts`) <!-- id: 02-gi-02 -->
- [ ] Task 3: Implement RFC-4180 CSV parser supporting quotes, CRLF, BOM, and empty strings <!-- id: 02-gi-03 -->
- [ ] Task 4: Write failing tests for `routes.txt` schema validation and parsing <!-- id: 02-gi-04 -->
- [ ] Task 5: Implement `routes.txt` parser and domain mapper <!-- id: 02-gi-05 -->
- [ ] Task 6: Write failing tests for `stops.txt` schema validation and parsing <!-- id: 02-gi-06 -->
- [ ] Task 7: Implement `stops.txt` parser and domain mapper <!-- id: 02-gi-07 -->
- [ ] Task 8: Write failing tests for `calendar.txt` and `calendar_dates.txt` schema validation <!-- id: 02-gi-08 -->
- [ ] Task 9: Implement `calendar.txt` and `calendar_dates.txt` parsers <!-- id: 02-gi-09 -->
- [ ] Task 10: Write failing tests for `trips.txt` schema validation and nullable fields <!-- id: 02-gi-10 -->
- [ ] Task 11: Implement `trips.txt` parser and domain mapper <!-- id: 02-gi-11 -->
- [ ] Task 12: Write failing tests for `stop_times.txt` parser with >24h `GtfsTime` parsing <!-- id: 02-gi-12 -->
- [ ] Task 13: Implement `stop_times.txt` parser with timepoint and composite key preservation <!-- id: 02-gi-13 -->
- [ ] Task 14: Write failing tests for Prisma batch persistence repository and FK ordering <!-- id: 02-gi-14 -->
- [ ] Task 15: Implement topological batch persistence in `prisma-gtfs-repository.ts` <!-- id: 02-gi-15 -->
- [ ] Task 16: Write failing test verifying strict import idempotency on re-ingestion <!-- id: 02-gi-16 -->
- [ ] Task 17: Implement idempotency deduplication handling <!-- id: 02-gi-17 -->
- [ ] Task 18: Write failing tests for partial failure rollback and transaction safety <!-- id: 02-gi-18 -->
- [ ] Task 19: Implement transaction boundary in `import-gtfs-use-case.ts` <!-- id: 02-gi-19 -->
- [ ] Task 20: Create standalone CLI runner script (`scripts/import-gtfs.ts`) with argument validation <!-- id: 02-gi-20 -->
- [ ] Task 21: Execute end-to-end integration test against local PostgreSQL database <!-- id: 02-gi-21 -->
