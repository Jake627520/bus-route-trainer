# Tasks: 01-domain-foundation

## TDD Implementation Sequence
- [x] Task 1: Write TDD failing test for `GtfsTime` value object (`gtfs-time.test.ts`) <!-- id: 01-df-01 -->
- [x] Task 2: Implement `GtfsTime` in `src/domain/shared/gtfs-time.ts` until tests PASS <!-- id: 01-df-02 -->
- [x] Task 3: Write TDD failing test for `TripStop` entity (`trip-stop.test.ts`) <!-- id: 01-df-03 -->
- [x] Task 4: Implement `TripStop` in `src/domain/trip/trip-stop.ts` until tests PASS <!-- id: 01-df-04 -->
- [x] Task 5: Write TDD failing test for `StopSequence` aggregate (`stop-sequence.test.ts`) <!-- id: 01-df-05 -->
- [x] Task 6: Implement `StopSequence` in `src/domain/trip/stop-sequence.ts` until tests PASS <!-- id: 01-df-06 -->
- [x] Task 7: Write TDD failing tests for `ServiceCalendar` and calendar exceptions (`service-calendar.test.ts`) <!-- id: 01-df-07 -->
- [x] Task 8: Implement `ServiceCalendar` and exception evaluator in `src/domain/service/service-calendar.ts` <!-- id: 01-df-08 -->
- [x] Task 9: Write TDD failing test for Route to Trip relationships and RouteVariant (`route-trip.test.ts`) <!-- id: 01-df-09 -->
- [x] Task 10: Implement `Route`, `Trip`, and `RouteVariant` domain structures in `src/domain/route/` <!-- id: 01-df-10 -->
- [x] Task 11: Write TDD failing test for GTFS import boundary idempotency (`gtfs-import-idempotency.test.ts`) <!-- id: 01-df-11 -->
- [x] Task 12: Implement import boundary fixture verifying zero duplicate records <!-- id: 01-df-12 -->
- [x] Task 13: Define Driver personal knowledge boundary interfaces (`DriverNote`, `HazardAlert`) in `src/domain/driver/` <!-- id: 01-df-13 -->
- [x] Task 14: Define Prisma Schema reflecting domain entities, constraints, and composite unique keys <!-- id: 01-df-14 -->
- [x] Task 15: Run full regression suite (`npm test`, `npm run lint`, `npm run build`) with 100% green pass <!-- id: 01-df-15 -->
