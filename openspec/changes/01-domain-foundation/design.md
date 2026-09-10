# Design: 01-domain-foundation

## Architectural Decisions

### ADR-01: Pure TypeScript Core Domain (`src/domain/`)
- **Context**: Domain calculations (stop sequence, cross-midnight service time, calendar eligibility, SRS cards) must be shared across web, mobile PWA, and CLI importers without framework coupling.
- **Decision**: No Next.js, React, or Prisma dependencies inside `src/domain/`. Domain entities and value objects are plain TypeScript classes or immutable data objects.

### ADR-02: GTFS Time Semantics (`GtfsTime`)
- **Context**: GTFS trips frequently operate past midnight (e.g. `24:15:00` or `25:30:00`), belonging to the previous service day. Standard JavaScript `Date` or `DateTime` objects roll over to the next calendar date or fail validation.
- **Decision**: Introduce `GtfsTime` value object storing total seconds from noon-minus-12h or normalized `hours`, `minutes`, `seconds`. Supports arithmetic, string formatting (`HH:MM:SS`), and ordering comparisons while preserving raw GTFS timetable string fidelity.

### ADR-03: TripStop Identity & Uniqueness
- **Context**: A physical stop (`stopId`) appears in hundreds of trips. A trip visits stops in a specific sequential order.
- **Decision**: In persistence and domain modeling, `TripStop` identity is composite: `(tripId, stopSequence)`.

### ADR-04: RouteVariant as Application Domain Concept
- **Context**: GTFS specification does not contain a `variants.txt` table. Routes have multiple Trips with differing stop patterns and headsigns.
- **Decision**: `RouteVariant` is an application domain aggregate computed from Trips sharing the identical sequence of stops and `directionId`. It is not directly a raw GTFS table.

### ADR-05: Complete Decoupling of Driver Personal Knowledge
- **Context**: Official transport data is refreshed periodically via GTFS imports. Driver notes, hazard alerts, and SRS card ratings must never be overwritten or deleted during feed updates.
- **Decision**: Separate database tables and domain models (`DriverNote`, `HazardAlert`, `SrsCard`). They store foreign keys referencing `stopId` or `routeId`, but have their own lifecycles.
