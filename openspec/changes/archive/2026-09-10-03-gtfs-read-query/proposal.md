# Proposal: 03-gtfs-read-query

## Why

With Change 01 (`01-domain-foundation`) and Change 02 (`02-gtfs-importer`) complete, the application has pure domain aggregates (`StopSequence`, `RouteVariant`, `GtfsTime`) and an atomic, idempotent Two-Pass ingestion pipeline populating PostgreSQL (`GtfsRoute`, `GtfsTrip`, `GtfsStopTime`, `GtfsStop`).

However, the system currently operates purely as a write-only ingestion pipeline:
1. **Application Query Gap**: `GtfsRepository` only provides transactional write and single-record comparison methods. There is no query port or service to read persisted transport data.
2. **Hydration Gap**: Persisted relational records are not yet reconstructed into domain models (`groupTripsIntoRouteVariants`, `StopSequence`, `GtfsTime`).
3. **API Gap**: Next.js lacks endpoints for consumers to query routes and their operational stop sequence variants.

To establish a functioning application vertical slice without leaping prematurely into UI or GIS complexity, Change 03 implements the **GTFS Read Side**: a typed query repository, query use cases, in-memory domain reconstruction, and minimal HTTP API endpoints.

## What Changes

### 1. Read Repository Port (`GtfsReadRepository`)
Define a dedicated, typed read-only port in `src/application/gtfs/gtfs-read-repository.port.ts` strictly decoupled from the write repository:
- `findAllRoutes(): Promise<RouteSummaryDto[]>`
- `findTripsWithStopTimesByRouteId(routeId: string): Promise<RouteTripAggregateDto | null>`

To avoid redundant database round trips, `findRouteById` is omitted; route detail and existence are verified directly via `findTripsWithStopTimesByRouteId`, which returns `null` if the route does not exist.

### 2. Anti-N+1 Prisma Read Repository Implementation
Implement `PrismaGtfsReadRepository` in `src/infrastructure/gtfs/query/`:
- **Bounded Query Strategy**: Retrieve route metadata, trips, stop times, and stop names using a bounded query strategy. Application and API layers are strictly prohibited from issuing per-trip or per-stop queries in loops.
- **Deterministic Database Ordering**:
  - Routes ordered deterministically by `shortName ASC`, then `id ASC` (standard character code ordering, avoiding ad-hoc natural sorting).
  - Stop times within each trip ordered strictly by `stopSequence ASC`.
  - Trips ordered by `directionId ASC`, then `id ASC`.

### 3. Application Query Services & Domain Reconstruction
Implement query use cases in `src/application/gtfs/`:
- `ListRoutesUseCase`: returns all persisted/imported GTFS routes (without attempting active-date filtering or calendar-based status calculations).
- `GetRouteVariantsUseCase`: orchestrates loading route trips and stop times from `GtfsReadRepository`, hydrating them into domain `TripStop` and `StopSequence` instances adhering to Change 01 time rules (nullable `GtfsTime`, zero JS `Date`), and invoking Change 01's existing `groupTripsIntoRouteVariants` function.
- **Deterministic Variant Attribute Selection**:
  - `variantKey`: strictly derived from `(directionId, orderedStopIds)`.
  - `headsign`: selected as the lexicographically smallest non-null `tripHeadsign` among trips in the variant group (or `null` if all are null). Does not participate in `variantKey`.
  - `sampleTripId`: selected as the lexicographically smallest `tripId` among trips in the variant group.

### 4. Minimal Next.js API Routes (Strictly 2 Endpoints)
Expose only two read-only REST endpoints under `src/app/api/routes/`:
- `GET /api/routes`: returns list of persisted routes.
- `GET /api/routes/[routeId]/variants`: returns reconstructed route variants, direction, headsign, sample trip, and ordered stop sequences.
- Standard JSON envelope and error handling:
  - 200 OK: `{ data: T }`
  - 404 Not Found: `{ error: { code: 'ROUTE_NOT_FOUND', message: string } }`
  - 500 Internal Error: `{ error: { code: 'INTERNAL_ERROR', message: string } }`

### 5. Deterministic Response Sorting
- Routes: sorted by `shortName` ascending, then `id` ascending.
- Variants: sorted by `directionId` ascending, then `variantKey` ascending.
- Stops within a variant: strictly ordered by `stopSequence` ascending.

## Capabilities

### New Capabilities
- `gtfs-read-repository`: Typed read-only repository contract and Prisma implementation with bounded query execution preventing N+1 loops.
- `route-query-services`: Application services (`ListRoutesUseCase`, `GetRouteVariantsUseCase`) that reconstruct domain `RouteVariant` collections from raw relational tables via existing Change 01 functions.
- `routes-api-endpoints`: Next.js Route Handlers (`GET /api/routes`, `GET /api/routes/[routeId]/variants`) with strict schema and error contracts.

### Non-Goals & Scope Guardrails
- **Zero Prisma Schema Modifications**: `prisma/schema.prisma` remains strictly unchanged.
- **No Route Domain Aggregate**: `Route` remains an application-level DTO / Query Model (`RouteSummaryDto`).
- **No RouteVariant Persistence**: `RouteVariant` remains a derived in-memory domain concept. It is not saved to any database table.
- **No Active Route Calculation**: No calendar-based or service-date active route filtering.
- **No Extra Endpoints**: Absolutely no `/api/stops`, `/api/trips`, `/api/calendar`, `/api/agencies`.
- **No Driver Knowledge**: `DriverNote` and `HazardAlert` are completely excluded from read queries and API payloads.
- **No UI / Presentation**: No React components, Map, GIS, Leaflet, or styling.
- **No Real-Time / Realtime tracking**: No GTFS-RT, GPS, or WebSocket infrastructure.
- **No Modification to Change 02 Code**: Existing importer code, CLI runner, and fixtures are reused as-is without modification.
