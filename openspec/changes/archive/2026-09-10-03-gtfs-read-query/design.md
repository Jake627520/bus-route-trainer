# Design: 03-gtfs-read-query

## Context & Problem Statement

Change 01 established the core domain modeling (`RouteVariant`, `StopSequence`, `GtfsTime`). Change 02 established the Two-Pass streaming importer with transactional atomicity, storing GTFS data into PostgreSQL.

Currently, the system is exclusively write-capable. To prepare the system for driver learning features without coupling the future UI directly to database tables, Change 03 introduces the **GTFS Read Side**:
- Clean abstraction between Read and Write repositories.
- Bounded query strategy preventing N+1 loop anti-patterns.
- Deterministic reconstruction of `RouteVariant` collections from raw relational records.
- Strict REST API contracts.

## Architectural Boundaries

```text
HTTP Client
    │
    ▼
Next.js Route Handlers (GET /api/routes, GET /api/routes/[routeId]/variants)
    │
    ▼
Application Query Services (ListRoutesUseCase, GetRouteVariantsUseCase)
    │                                              │
    ▼                                              ▼
GtfsReadRepository (Port)                  Domain Logic (Change 01)
    │                                      (groupTripsIntoRouteVariants,
    ▼                                       StopSequence, GtfsTime)
PrismaGtfsReadRepository
    │
    ▼
PostgreSQL (GtfsRoute, GtfsTrip, GtfsStopTime, GtfsStop)
```

## Detailed Component Specifications

### 1. DTO & Query Models (`src/application/gtfs/gtfs-query.dto.ts`)

```typescript
export interface RouteSummaryDto {
  id: string;
  shortName: string;
  longName: string;
  routeType: number;
}

export interface RouteStopTimeDto {
  stopSequence: number;
  stopId: string;
  stopName: string;
  arrivalTime: string | null;
  departureTime: string | null;
  isTimepoint: boolean;
}

export interface RouteTripDetailDto {
  tripId: string;
  serviceId: string;
  directionId: number;
  tripHeadsign: string | null;
  shapeId: string | null;
  stopTimes: RouteStopTimeDto[];
}

export interface RouteTripAggregateDto {
  route: RouteSummaryDto;
  trips: RouteTripDetailDto[];
}

export interface RouteVariantStopDto {
  stopSequence: number;
  stopId: string;
  stopName: string;
  isTimepoint: boolean;
}

export interface RouteVariantDto {
  variantKey: string;
  routeId: string;
  directionId: number;
  headsign: string | null;
  stopCount: number;
  sampleTripId: string;
  tripCount: number;
  orderedStops: RouteVariantStopDto[];
}
```

### 2. Read Repository Port (`src/application/gtfs/gtfs-read-repository.port.ts`)

```typescript
export interface GtfsReadRepository {
  /**
   * Retrieves all persisted GTFS routes in deterministic order.
   * Does not filter by active date or calendar.
   */
  findAllRoutes(): Promise<RouteSummaryDto[]>;

  /**
   * Retrieves route metadata along with all associated trips and ordered stop times
   * using a bounded query strategy to prevent N+1 queries.
   * Returns null if the route does not exist.
   */
  findTripsWithStopTimesByRouteId(routeId: string): Promise<RouteTripAggregateDto | null>;
}
```

### 3. Anti-N+1 Bounded Query Strategy (`PrismaGtfsReadRepository`)

To prevent N+1 query execution, `findTripsWithStopTimesByRouteId` executes an eager relation loading query rather than querying trips or stops in iterative loops:

```typescript
const result = await this.prisma.gtfsRoute.findUnique({
  where: { id: routeId },
  include: {
    trips: {
      orderBy: [
        { directionId: 'asc' },
        { id: 'asc' },
      ],
      include: {
        stopTimes: {
          orderBy: { stopSequence: 'asc' },
          include: {
            stop: {
              select: { name: true },
            },
          },
        },
      },
    },
  },
});
```

- **Bounded Execution Invariant**: A request for a route's variants generates a bounded, constant number of database operations independent of whether the route has 2 trips or 200 trips, or 10 stops or 100 stops.
- **Loop Prohibition**: Application services and route handlers are strictly prohibited from executing iterative queries per trip or per stop.

### 4. Deterministic Ordering & Attribute Selection Invariants

1. **Routes Listing**:
   `ORDER BY shortName ASC, id ASC` (standard lexicographical string ordering).
2. **Trips within Route**:
   `ORDER BY directionId ASC, id ASC`.
3. **Stop Times within Trip**:
   `ORDER BY stopSequence ASC`.
4. **Variants Listing**:
   Sorted deterministically by `directionId ASC`, then `variantKey ASC`.
5. **Variant Headsign Selection**:
   - `variantKey` is derived strictly from `(directionId, orderedStopIds)`. `tripHeadsign` does NOT participate in variant identity.
   - The representative `headsign` is selected as the lexicographically smallest non-null `tripHeadsign` among trips within the variant group (using standard character code comparison `<` / `>`). If all trips in the group have null headsigns, `headsign` is `null`.
6. **Variant Sample Trip Selection**:
   - `sampleTripId` is selected as the lexicographically smallest `tripId` among trips in the variant group.
7. **Variant Ordered Stops Source**:
   - `orderedStops` MUST be derived strictly from the trip whose `tripId === sampleTripId` (the deterministically selected sample trip).
   - Representative stop attributes (`stopSequence`, `stopId`, `stopName`, `isTimepoint`) are sourced directly from this sample trip.
   - Stop attributes MUST NOT be sourced from database query iteration order, an arbitrary first record, or conflicting non-deterministic trips.
   - `variantKey` remains strictly derived from `(directionId, orderedStopIds)`. Variations in `stopSequence` values across trips sharing identical stop ID sequences do not alter variant grouping; the canonical `sampleTripId` provides the representative sequence numbers.

### 5. Application Services & Domain Reconstruction

#### `ListRoutesUseCase` (`src/application/gtfs/list-routes-use-case.ts`)
- Calls `readRepository.findAllRoutes()`.
- Returns all persisted routes as `RouteSummaryDto[]` without calendar filtering.

#### `GetRouteVariantsUseCase` (`src/application/gtfs/get-route-variants-use-case.ts`)
- Calls `readRepository.findTripsWithStopTimesByRouteId(routeId)` directly (omitting any prior `findRouteById` call to save database round trips).
- If result is `null`, throws `RouteNotFoundError`.
- **Domain Reconstruction Flow**:
  1. Hydrates raw stop times into domain `TripStop` objects:
     - `arrivalTime !== null ? GtfsTime.parse(s.arrivalTime) : null`
     - `departureTime !== null ? GtfsTime.parse(s.departureTime) : null`
     - Zero JavaScript `Date` or PostgreSQL `TIME` conversion.
  2. Constructs domain `StopSequence(tripStops)` validating the monotonicity invariant.
  3. Constructs domain `Trip` representations with `id`, `routeId`, `directionId`, and `StopSequence`.
  4. Invokes Change 01's existing domain algorithm `groupTripsIntoRouteVariants(domainTrips)`.
  5. Maps reconstructed variants into `RouteVariantDto[]`: `orderedStops` are sourced strictly from the deterministic `sampleTripId` trip, applying the deterministic `headsign` and `sampleTripId` selection rules.

### 6. Next.js API Routes & Response Envelopes

#### Route 1: `GET /api/routes`
- **Response 200**:
  ```json
  {
    "data": [
      {
        "id": "R66",
        "shortName": "66",
        "longName": "RBWH - UQ Lakes",
        "routeType": 3
      }
    ]
  }
  ```

#### Route 2: `GET /api/routes/[routeId]/variants`
- **Response 200**:
  ```json
  {
    "data": [
      {
        "variantKey": "DIR0_ST01_ST02_ST03",
        "routeId": "R66",
        "directionId": 0,
        "headsign": "UQ Lakes",
        "stopCount": 3,
        "sampleTripId": "T66_01",
        "tripCount": 1,
        "orderedStops": [
          { "stopSequence": 1, "stopId": "ST_01", "stopName": "RBWH Station", "isTimepoint": true },
          { "stopSequence": 23, "stopId": "ST_02", "stopName": "Cultural Centre", "isTimepoint": true },
          { "stopSequence": 40, "stopId": "ST_03", "stopName": "UQ Lakes", "isTimepoint": true }
        ]
      }
    ]
  }
  ```
- **Response 404 (Route not found)**:
  ```json
  {
    "error": {
      "code": "ROUTE_NOT_FOUND",
      "message": "Route with id 'NON_EXISTENT' was not found"
    }
  }
  ```
- **Response 500 (Internal server error)**:
  ```json
  {
    "error": {
      "code": "INTERNAL_ERROR",
      "message": "An unexpected error occurred"
    }
  }
  ```

## Testing Strategy

1. **Repository Unit/Integration Tests** (`prisma-gtfs-read-repository.test.ts`):
   - Verifies bounded query behavior: fetching a route with multiple trips and stops executes without N+1 loop queries.
   - Verifies deterministic sorting order for routes, trips, and stop times.
   - Verifies empty database and non-existent route handling.
2. **Application Service Unit Tests** (`get-route-variants-use-case.test.ts`):
   - Mocks `GtfsReadRepository`.
   - Tests separate invariants:
     - Monotonic stop sequence validation via `StopSequence`.
     - Deterministic variant grouping via Change 01's `groupTripsIntoRouteVariants`.
     - Deterministic headsign selection (lexicographical minimum non-null) and sampleTripId selection.
     - Nullable `GtfsTime` parsing adherence.
     - `RouteNotFoundError` on non-existent route.
3. **API Handler Integration Tests** (`routes-api.test.ts`):
   - Tests `GET /api/routes` returns 200 and standard envelope `{ data: [...] }`.
   - Tests `GET /api/routes/[routeId]/variants` returns 200 with variants.
   - Tests `GET /api/routes/INVALID/variants` returns 404 with error envelope `{ error: { code: 'ROUTE_NOT_FOUND', ... } }`.
4. **End-to-End PostgreSQL Integration Test** (`gtfs-read-e2e.test.ts`):
   - Test setup invokes the existing Change 02 importer with `valid-feed` fixture.
   - Strictly does NOT modify Change 02 code, fixtures, schema, or OpenSpec archive.
   - Verifies complete flow from PostgreSQL through `PrismaGtfsReadRepository`, `GetRouteVariantsUseCase`, to Route Handler response.
