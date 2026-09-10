# Tasks: 03-gtfs-read-query

## TDD Implementation Sequence (RED → GREEN → REFACTOR)

- [x] Task 01: Define query DTO models and typed read-only query repository port interface (`GtfsReadRepository` with `findAllRoutes` and `findTripsWithStopTimesByRouteId`) in `src/application/gtfs/gtfs-read-repository.port.ts` <!-- id: 03-grq-01 -->
- [x] Task 02: Write failing integration tests for `PrismaGtfsReadRepository` verifying bounded query execution (query count independent of trip/stop counts; zero per-trip or per-stop loop queries), deterministic route sorting (`shortName ASC, id ASC`), trip ordering (`directionId ASC, id ASC`), and stop sequence ordering (`stopSequence ASC`) (`prisma-gtfs-read-repository.test.ts`) <!-- id: 03-grq-02 -->
- [x] Task 03: Implement `PrismaGtfsReadRepository` in `src/infrastructure/gtfs/query/prisma-gtfs-read-repository.ts` turning repository tests green <!-- id: 03-grq-03 -->
- [x] Task 04: Write failing unit tests for `ListRoutesUseCase` verifying retrieval of all persisted routes and summary DTO mapping without calendar/active filtering (`list-routes-use-case.test.ts`) <!-- id: 03-grq-04 -->
- [x] Task 05: Implement `ListRoutesUseCase` in `src/application/gtfs/list-routes-use-case.ts` <!-- id: 03-grq-05 -->
- [x] Task 06: Write failing unit tests for `GetRouteVariantsUseCase` verifying: (1) nullable `GtfsTime` hydration adhering to Change 01 rules, (2) sequence monotonicity via `StopSequence`, (3) domain reconstruction via Change 01 `groupTripsIntoRouteVariants`, (4) deterministic `headsign` (lexicographically smallest non-null) and `sampleTripId` selection, (5) `orderedStops` attributes sourced strictly from the deterministic `sampleTripId`, and (6) `RouteNotFoundError` on unknown route (`get-route-variants-use-case.test.ts`) <!-- id: 03-grq-06 -->
- [x] Task 07: Implement `GetRouteVariantsUseCase` in `src/application/gtfs/get-route-variants-use-case.ts` turning variant reconstruction tests green <!-- id: 03-grq-07 -->
- [x] Task 08: Write failing integration tests for Next.js Route Handler `GET /api/routes` verifying 200 envelope `{ data: [...] }` and deterministic sorting (`routes-api.test.ts`) <!-- id: 03-grq-08 -->
- [x] Task 09: Implement Next.js Route Handler `GET /api/routes` in `src/app/api/routes/route.ts` <!-- id: 03-grq-09 -->
- [x] Task 10: Write failing integration tests for Next.js Route Handler `GET /api/routes/[routeId]/variants` verifying 200 variant payload, 404 error envelope `{ error: { code: 'ROUTE_NOT_FOUND', message: string } }`, and 500 error handling (`route-variants-api.test.ts`) <!-- id: 03-grq-10 -->
- [x] Task 11: Implement Next.js Route Handler `GET /api/routes/[routeId]/variants` in `src/app/api/routes/[routeId]/variants/route.ts` <!-- id: 03-grq-11 -->
- [x] Task 12: Write end-to-end integration test verifying complete flow: import synthetic `valid-feed` using existing Change 02 importer without modifying Change 02 code or fixtures, query `/api/routes`, and query `/api/routes/R66/variants` verifying deterministic stops and variants against local PostgreSQL (`gtfs-read-e2e.test.ts`) <!-- id: 03-grq-12 -->
- [x] Task 13: Run complete verification suite (`npm test`, `npm run lint`, `npm run build`, `npx prisma validate`, `openspec doctor`, `git diff --check`) confirming 0 schema changes, 0 regressions, and clean boundary <!-- id: 03-grq-13 -->
