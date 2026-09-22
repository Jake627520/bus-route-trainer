# Proposal: Change 10 — Recall Session Client/UI Integration

**Status**: IN_PROGRESS (Gate 10.1 Approved -> Phase 10.2 GO)  
**Scope Boundary**: API Client + UI Orchestration Layer Only  

---

## 1. Context & Motivation

Changes 07, 08, 09 have been completely implemented and verified:
- **Change 07**: SRS scheduling engine, interval multiplier, and state transitions.
- **Change 08**: Recall session core domain lifecycle, deterministic evaluator, concurrency controls (SELECT FOR UPDATE row locking), and attempt-level idempotency.
- **Change 09**: RESTful Route Handlers under `/api/recall/sessions/...`, authoritative server-side driver identity resolution, and sanitized error mapping.

To deliver this functionality to bus drivers without compromising architectural integrity, **Change 10** introduces the frontend client and user interface layer.

---

## 2. Core Principles & Non-Negotiable Rules

1. **Discovery & Contract Lock First**: UI implementation must NOT guess API DTOs. It must strictly bind to the existing Change 09 API schemas.
2. **Strict Boundary Preservation**:
   - Change 10 is an API consumer and UI orchestrator ONLY.
   - If an API response is inconvenient for the UI, **Change 10 MUST NOT modify Change 07, 08, or 09**. Instead, work is paused (HOLD) and an independent OpenSpec Change must be proposed.
3. **Frontend View State ≠ Backend Domain State**:
   - Backend authoritative lifecycle: `IN_PROGRESS` | `COMPLETED` | `ABANDONED`.
   - Frontend UX view states (11 View States): `IDLE` | `STARTING` | `NO_CARDS_AVAILABLE` | `ACTIVE` | `SUBMITTING` | `SUBMIT_FAILED` | `FEEDBACK` | `COMPLETED` | `ABANDONING` | `ABANDONED` | `ERROR`.
   - UI never attempts to compute or enforce domain state machines; it reacts strictly to API responses.
4. **Controlled Submission Identity (Anti-Idempotency-Conflict)**:
   - GET queries (session state, prompt fetch) are safe to retry.
   - POST `/answer` submissions **MUST NOT be auto-retried arbitrarily**. Any retry must reuse the exact submission identity (`sessionId`, `promptIndex`, `rawInput`, `recallMode`) to prevent triggering HTTP 409 `IDEMPOTENCY_CONFLICT`.
5. **P0 Security Compliance**:
   - Client UI and API Client NEVER supply `driverId` in request bodies or query params. Identity is resolved authoritative server-side.

---

## 3. Scope Specification

### IN SCOPE
- **Recall API Client Layer** (`src/application/recall/client/`):
  - Type-safe HTTP client (`recall-api.ts`) wrapping all 5 Change 09 endpoints.
  - Complete DTO models matching Change 09 (`recall-types.ts`).
  - Standardized error hierarchy and mapping (`recall-errors.ts`).
- **Recall Practice UI** (`/practice/recall`):
  - Start Session form / trigger (Route selection, variant selection, optional session size).
  - Empty state (`NO_ELIGIBLE_CARDS`) graceful handling.
  - Active Prompt display: Reference prompt, question, recall mode badge, progress indicator.
  - Answer input box with keyboard shortcuts (Enter to submit, Tab focus).
  - Feedback screen: Immediate Correct/Incorrect banner, SRS level change, next prompt transition button.
  - Session Summary screen: Completed state, total questions, score/outcome tally.
  - Session Abandon modal / confirmation dialog.
  - Responsive mobile-first layout (tailored for bus drivers on tablets/phones in Queensland transit hubs).
  - Accessible UI elements (ARIA labels, keyboard navigation, high contrast).
- **Testing**:
  - API Client unit & contract integration tests with mocked/isolated HTTP responses.
  - UI component and view state machine tests using Vitest + Testing Library.

### OUT OF SCOPE
- Modifications to Change 07 (SRS formulas / scheduling).
- Modifications to Change 08 (Session domain rules, concurrency locks, persistence logic).
- Modifications to Change 09 (Route Handlers, DTO structures, error status codes).
- Database schema alterations or Prisma migrations.
- Authentication system redesign or login UI (server-side context remains authoritative).
- Offline storage / Service Worker caching / PWA sync (reserved for future Change).

---

## 4. Phase Rollout

- **Phase 10.1 — Discovery & Contract Lock (Current Gate)**:
  - Audit Next.js App Router, Tailwind tokens, and Change 09 endpoint contracts.
  - Define OpenSpec proposal, specs, and tasks.
  - Formal review & user approval gate before any UI code is written.
- **Phase 10.2 — API Client Contract Implementation**:
  - Build `src/application/recall/client/` (API client, types, error mappings).
  - Write comprehensive client unit tests verifying 200/201/400/401/403/404/409 error mappings.
- **Phase 10.3 — UI Components & Practice Experience**:
  - Implement `/practice/recall` page and subcomponents.
  - Implement view state orchestration with controlled submission identity.
  - Vitest component tests & responsive layout verification.
