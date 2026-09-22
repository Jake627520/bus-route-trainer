# Design: 01-domain-foundation

## Architectural Decisions

### ADR-01: Pure TypeScript Core Domain (`src/domain/`)
- **Context**: Domain calculations (stop sequence, cross-midnight service time, calendar eligibility) must be shared across web, mobile PWA, and CLI importers without framework coupling.
- **Decision**: No Next.js, React, or Prisma dependencies inside `src/domain/`. Domain entities and value objects are plain TypeScript immutable objects or pure classes.

### ADR-02: GTFS Time Semantics (`GtfsTime`)
- **Context**: GTFS trips frequently operate past midnight (e.g. `24:15:00` or `25:30:00`), belonging to the previous service day. Standard JavaScript `Date` or `DateTime` objects roll over to the next calendar date or fail validation.
- **Decision**: Define `GtfsTime` strictly as **service-day elapsed seconds** from the start of the service day (00:00:00 = 0s). Supports hours >= 0 (e.g. 0 to 47 to support extended multi-day operational runs), minutes 0..59, seconds 0..59. Zero reliance on JavaScript `Date` and zero timezone shifts.

### ADR-03: TripStop Identity, Optional Times, and Uniqueness
- **Context**: A physical stop (`stopId`) appears in many trips. A trip visits stops in a sequential order (`stopSequence`). In some GTFS feeds, arrival or departure times may be missing for intermediate interpolated stops.
- **Decision**: `TripStop` identity is composite: `(tripId, stopSequence)`. `arrivalTime` and `departureTime` are strictly typed as `GtfsTime | null` (preserving present vs missing without fabricating times). Duplicate `stopSequence` within the same trip is an invalid domain error.

### ADR-04: RouteVariant as Application Domain Derived Concept
- **Context**: GTFS specification does not contain a `variants.txt` table. Routes have multiple Trips with differing stop patterns and headsigns.
- **Decision**: `RouteVariant` is a derived concept grouped by signature of `(directionId, orderedStopIds)`. It is not a raw GTFS table.

### ADR-05: Decoupled Driver Knowledge & Deferred SRS Engine
- **Context**: Official transport data is refreshed periodically via GTFS imports. Driver notes and hazards are private memory aids.
- **Decision**: Driver personal knowledge is strictly separated from GTFS models. SRS algorithms and Quiz scheduling are explicitly deferred to dedicated changes (e.g. `08-srs-engine`) to protect Phase 1 scope.
