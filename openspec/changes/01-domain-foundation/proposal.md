# Proposal: 01-domain-foundation

## Summary
Establish the pure TypeScript core domain model, value objects, and persistence contracts for **Bus Route Trainer** (Phase 1). This proposal rigorously decouples **Official Transport GTFS Data**, **Application Domain Logic**, and **Driver Personal Knowledge**, enforcing Australian English (`en-AU`) and strict Test-Driven Development (TDD).

## Domain Boundaries
```
┌────────────────────────────────────────────────────────┐
│            1. Official Transport Data (GTFS)           │
│  - Immutable reference data from Translink QLD         │
│  - Entities: Agency, Route, Trip, Stop, StopTime,      │
│              Calendar, CalendarDate, Shape             │
│  - Never modified or polluted with driver notes        │
└───────────────────────────┬────────────────────────────┘
                            │ (read / reference)
                            ▼
┌────────────────────────────────────────────────────────┐
│             2. Application Domain Logic                │
│  - Pure TypeScript logic (zero web / Prisma runtime)   │
│  - Value Objects: GtfsTime (service-day >24h format)   │
│  - Aggregates/Services: StopSequence, TripSchedule,    │
│                         ServiceCalendarEvaluator,      │
│                         RouteVariantGrouper            │
│  - Rules: stop_sequence ordering, arrival/departure    │
│           preservation, timepoints, calendar exception │
└───────────────────────────┬────────────────────────────┘
                            │ (learns / references)
                            ▼
┌────────────────────────────────────────────────────────┐
│            3. Driver Personal Knowledge (SRS)          │
│  - Private driver memory aids and risk reminders       │
│  - DriverNote, HazardAlert, SrsCard, ReviewAttempt     │
│  - Completely separate persistence & identity          │
└────────────────────────────────────────────────────────┘
```

## Goals
1. **GtfsTime Value Object**: Parse, format, validate, and compare GTFS timetable times supporting cross-midnight service hours (e.g. `24:10:00`, `25:05:00`). Zero reliance on JavaScript `Date`.
2. **StopSequence Aggregate**: Calculate `getFirstStop()`, `getLastStop()`, `getNextStop()`, `getPreviousStop()`, and `getStopAtSequence()` strictly by `stopSequence` order regardless of array insertion order.
3. **Trip & StopTime Fidelity**: Preserve discrete `arrivalTime` vs `departureTime` and boolean `timepoint` indicators without synthesizing missing data.
4. **ServiceCalendar Domain**: Evaluate service availability for specific dates considering regular weekday masks and `CalendarDate` exception additions (type 1) and removals (type 2).
5. **Route ↔ Trip ↔ Stop Cardinality**: Model GTFS reality where one Route has multiple Trips and Variants across directions, and stops are shared across multiple trips via `(tripId, stopSequence)` composite keys.
6. **Import Idempotency Fixture**: Establish a test fixture guaranteeing re-importing identical GTFS feeds causes zero duplicate records.
7. **Prisma Schema Foundation**: Provide a robust persistence schema reflecting domain boundaries with unique constraints and composite indexes.

## Non-Goals (Scope Protection for V1)
- ❌ No GTFS-Realtime (GTFS-RT) or GPS live vehicle positions.
- ❌ No UI components, Route Explorer UI, Dashboard, Quiz UI, or MapLibre rendering.
- ❌ No remote GTFS downloading or external website scraping.
- ❌ No OAuth or multi-tenant cloud authentication.

## Acceptance Criteria
- [ ] `gtfs-time.test.ts` PASS with full validation of standard and >24h service day times, arithmetic, and rejection of invalid values.
- [ ] `stop-sequence.test.ts` PASS with out-of-order inputs correctly sorted by `stopSequence`, and correct terminal boundary handling.
- [ ] `trip-stop.test.ts` PASS with independent `arrivalTime`, `departureTime`, and `timepoint` preserved.
- [ ] `service-calendar.test.ts` and `calendar-exception.test.ts` PASS with weekday masks and ADD/REMOVE exception dates verified.
- [ ] `route-trip.test.ts` PASS verifying 1:N Route-to-Trip cardinality and RouteVariant grouping.
- [ ] `gtfs-import-idempotency.test.ts` PASS demonstrating zero duplication on repeated imports.
- [ ] Pure TypeScript core in `src/domain/` with zero runtime dependencies on Next.js, React, or Prisma.
- [ ] Prisma schema with `(tripId, stopSequence)` uniqueness and proper indexes.
- [ ] `npm test`, `npm run lint`, and `npm run build` all PASS.
