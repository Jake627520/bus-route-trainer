# Tasks: 01-domain-foundation

## TDD Implementation Sequence
- [ ] Task 1: Write TDD failing test for `GtfsTime` value object (`gtfs-time.test.ts`) <!-- id: 01-df-01 -->
- [ ] Task 2: Implement `GtfsTime` in `src/domain/shared/gtfs-time.ts` until tests PASS <!-- id: 01-df-02 -->
- [ ] Task 3: Write TDD failing test for `StopSequence` aggregate (`stop-sequence.test.ts`) <!-- id: 01-df-03 -->
- [ ] Task 4: Implement `StopSequence` and `TripStop` in `src/domain/trip/` until tests PASS <!-- id: 01-df-04 -->
- [ ] Task 5: Write TDD failing test for Arrival/Departure & Timepoint preservation (`trip-stop.test.ts`) <!-- id: 01-df-05 -->
- [ ] Task 6: Implement TripStop value object / entity ensuring separation of arrival and departure times <!-- id: 01-df-06 -->
- [ ] Task 7: Write TDD failing tests for `ServiceCalendar` and calendar exceptions (`service-calendar.test.ts`, `calendar-exception.test.ts`) <!-- id: 01-df-07 -->
- [ ] Task 8: Implement `ServiceCalendar` and exception evaluator in `src/domain/service/` <!-- id: 01-df-08 -->
- [ ] Task 9: Write TDD failing test for Route to Trip relationships and RouteVariant (`route-trip.test.ts`) <!-- id: 01-df-09 -->
- [ ] Task 10: Implement `Route`, `Trip`, and `RouteVariant` domain structures <!-- id: 01-df-10 -->
- [ ] Task 11: Write TDD failing test for GTFS import boundary idempotency (`gtfs-import-idempotency.test.ts`) <!-- id: 01-df-11 -->
- [ ] Task 12: Implement import normalizer boundary verifying zero duplicate records <!-- id: 01-df-12 -->
- [ ] Task 13: Define Driver personal knowledge boundary interfaces (`DriverNote`, `HazardAlert`) in `src/domain/driver/` <!-- id: 01-df-13 -->
- [ ] Task 14: Define Prisma Schema reflecting domain entities, constraints, and composite unique keys <!-- id: 01-df-14 -->
- [ ] Task 15: Run `npm test`, `npm run lint`, and `npm run build` to verify clean pass <!-- id: 01-df-15 -->
