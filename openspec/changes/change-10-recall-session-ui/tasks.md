# Tasks: Change 10 — Recall Session Client/UI Integration

## Phase 10.1: Discovery & Contract Lock (Current Gate)
- [x] **10.1.1** Audit Next.js App Router structure, CSS setup, and existing UI components.
- [x] **10.1.2** Verify and lock Change 09 REST API endpoint contracts and DTO structures across all 5 endpoints.
- [x] **10.1.3** Define controlled submission identity and retry guidelines to prevent `IDEMPOTENCY_CONFLICT`.
- [x] **10.1.4** Formulate OpenSpec proposal, specs, and tasks for Change 10.
- [x] **10.1.5** **[GATE 10.1 PASS]** Discovery findings and contract locks approved by human reviewer. Proceed to Phase 10.2.

---

## Phase 10.2: API Client Contract Implementation
- [x] **10.2.1** Create `src/application/recall/client/recall-types.ts` defining all Change 09 request/response DTOs and submission identity interfaces.
- [x] **10.2.2** Create `src/application/recall/client/recall-errors.ts` implementing strongly-typed client error hierarchy mapped to HTTP status codes.
- [x] **10.2.3** Create `src/application/recall/client/recall-api.ts` providing the type-safe `RecallApiClient` class wrapping Fetch API.
  - Enforce zero-client-`driverId` invariant.
  - Implement controlled submission retry handling.
- [x] **10.2.4** Create unit and contract tests in `src/__tests__/application/recall/recall-api-client.test.ts`.
  - Verify 200/201 response unwrapping (`data` envelope).
  - Verify 400/401/403/404/409 error mapping into typed error classes.
  - Verify rejection of client-provided `driverId`.
  - Verify controlled submission identity encapsulation.

---

## Phase 10.3: UI Components & Recall Practice Experience
- [x] **10.3.1** Build reusable UI primitives under `src/components/ui/` (`Button`, `Card`, `Badge`, `Modal`, `ProgressBar`, `TextInput`).
- [x] **10.3.2** Create `/practice/recall` page and layout (`src/app/practice/recall/page.tsx`).
- [x] **10.3.3** Implement `useRecallSession` custom hook managing the View State Machine (`IDLE` -> `ACTIVE` -> `SUBMITTING` -> `FEEDBACK` -> `COMPLETED`).
- [x] **10.3.4** Implement session start / route selector controls with empty state (`NO_ELIGIBLE_CARDS`) handling.
- [x] **10.3.5** Implement prompt view with reference clue, input form, and keyboard shortcuts (Enter to submit).
- [x] **10.3.6** Implement feedback view with outcome banner (CORRECT / INCORRECT) and SRS progress indicators.
- [x] **10.3.7** Implement session summary view displaying completed stats and return-to-dashboard controls.
- [x] **10.3.8** Implement session abandon modal with confirmation safeguard.
- [x] **10.3.9** Add UI component and view-state integration tests using Vitest + Testing Library.
- [x] **10.3.10** Verify mobile responsiveness and a11y standards across all states.
