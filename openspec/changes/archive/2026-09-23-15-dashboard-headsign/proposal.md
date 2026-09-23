# Proposal: 15-dashboard-headsign

狀態：`proposed`（等人審通過後進入實作）
編號：15。

## Why

複習儀表板（Change 11/14）每列目前只顯示「路線 {routeId} + 方向」，**沒有終點 headsign**
（例如「City → University」），司機難以一眼辨認是哪條路線的哪個方向。variant 列表（Change 07）
早就顯示 headsign，儀表板卻沒有——體驗不一致。

`GET /api/routes/{routeId}/variants` 的 `RouteVariantDto` 已含 `headsign`。Change 15 讓
`GetReviewSummaryUseCase` 為每個 enrolled variant 補上 headsign，前端在儀表板顯示。

## What Changes

### 1. 後端：summary 補 headsign（按 routeId 分組查詢）
- 新增窄 port `VariantHeadsignQueryPort.findHeadsignsByRoute(routeId)`
  → `{ variantKey, headsign: string | null }[]`。
- 以 `GetRouteVariantsUseCase` 實作 adapter：對某 routeId 取 variants → 映成 (variantKey → headsign)；
  route 不存在（`RouteNotFoundError`）或查詢失敗 → 回空陣列（**優雅降級**，headsign 視為 null）。
- `GetReviewSummaryUseCase` 加此 port：把 enrolled progress **按 routeId 分組**，每個 distinct route
  只查一次 headsign，建 `${routeId}::${variantKey}` → headsign 映射，補到每筆 summary。
  查不到 → `headsign: null`。
- `VariantReviewSummary` 加 `headsign: string | null`。

### 2. 前端：儀表板顯示 headsign
- `api-client` 型別同步加 `headsign`。
- `ReviewDashboard` 每列主標顯示 headsign（null → 「未標示終點」），
  「路線 {routeId}」與方向降為次要資訊。

### 3. 韌性
- headsign 為增益：任何 route 查詢失敗都不得讓 summary 掛掉——該列 headsign=null、其餘欄位照常。

### 4. 測試策略（TDD）
- 窄 port adapter：對應 GetRouteVariantsUseCase 的映射、route 不存在→[]。
- use-case：分組查詢、headsign 補值、查不到→null、查詢丟錯→該列 null 不中斷。
- API route：回應含 headsign。
- api-client：型別/解析涵蓋 headsign。
- ReviewDashboard：渲染 headsign 與 null fallback。

## Non-goals
- 後端 schema 變更（headsign 由 GTFS 即時查，不落庫）。
- variant 列表既有 headsign 行為（不動）。

## 影響
- 新增：`VariantHeadsignQueryPort` + adapter；修改 `get-review-summary-use-case.ts`、
  `review/summary/route.ts`（DI 接線）、`api-client.ts`、`review-dashboard.tsx` 及測試。
- 完成後於 `specs/` 建 spec 並 archive。

## 決策（2026-09-23 人審定案）
1. ✅ 儀表板主標用 headsign（null→未標示終點），次要顯示「路線 {routeId} · 方向」。
2. ✅ 每個 distinct routeId 各查一次（分組），不加快取層。
