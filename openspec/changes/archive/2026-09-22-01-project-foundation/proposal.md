# Proposal: 01-Project-Foundation

## Summary
Establish the engineering foundation for **Bus Route Trainer** (Queensland Bus Driver Route Learning & Memory Trainer) adhering strictly to **Australian English (`en-AU`)**, Translink CC BY 4.0 licensing attribution boundaries, OpenSpec Spec-Driven Development, and strict TDD methodology.

## Goals
1. Provide a deterministic, type-safe Next.js 16 + TypeScript + Tailwind CSS application foundation.
2. Establish a PostgreSQL + Prisma ORM database pipeline with idempotent migrations.
3. Configure an automated Vitest test harness with DOM assertions and zero test drift.
4. Enforce Australian English (`en-AU`) across all user-facing copy, types, and schema naming.
5. Isolate Translink GTFS official transport data, application domain data, and driver personal knowledge into clear bounded contexts.
6. Guarantee that GTFS archive files and production driver data are never committed to Git.

## Non-Goals (Strictly excluded from V1)
1. No real-time vehicle GPS tracking or GTFS-Realtime (GTFS-RT) in V1.
2. No Translink website scraping or non-official API ingestion.
3. No third-party OAuth / social logins in V1 (local driver profile session only).
4. No premature MapLibre / WebGL map rendering until the database, domain, and quiz models pass TDD verification.

## Bounded Contexts & Architecture
```
┌────────────────────────────────────────────────────────┐
│               Translink GTFS Data Layer                │
│ (Read-only reference: routes, trips, stops, calendar)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               Application Domain Layer                 │
│ (Stop sequence, timetables, timing points, variants)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Driver Knowledge & SRS Layer               │
│ (Personal notes, hazard alerts, active recall cards)   │
└────────────────────────────────────────────────────────┘
```

## Acceptance Criteria
- [x] Git repository initialized and pushed to `Jake627520/bus-route-trainer` with `.gitignore` strictly excluding GTFS zip archives.
- [x] OpenSpec CLI installed and initialized with Claude Code support.
- [x] `DATA-LICENSE.md` and `README.md` provide clear CC BY 4.0 attribution to Translink Queensland and declare independent application status.
- [x] `npm run lint`, `npm test`, and `npm run build` execute cleanly with zero errors.
- [x] GitHub Actions CI workflow runs automated verification on push and pull requests.
