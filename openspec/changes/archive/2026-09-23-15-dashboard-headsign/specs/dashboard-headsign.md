# Specification: Dashboard Headsign (Change 15)

複習儀表板每列補終點 headsign（如「City → University」），與 variant 列表一致，
讓司機一眼辨認路線方向。headsign 由 GTFS 即時查、不落庫；增益資料失敗一律降級為 null。

## 1. headsign 查詢 port + adapter

- `VariantHeadsignQueryPort.findHeadsignsByRoute(routeId)` → `{ variantKey, headsign: string | null }[]`。
- `GtfsVariantHeadsignAdapter` 以 `GetRouteVariantsUseCase` 實作：映 `RouteVariantDto` → (variantKey, headsign)；
  `RouteNotFoundError` → 回 `[]`；其他錯誤往上拋（由 use-case 降級）。

## 2. use-case 補 headsign（分組查詢 + 降級）

- `GetReviewSummaryUseCase` 加 `VariantHeadsignQueryPort` 依賴。
- enrolled 依 `routeId` 去重，每個 distinct route **只查一次** headsign（`Promise.all` 併發），
  建 `${routeId}::${variantKey}` → headsign 映射。
- 每筆 summary 補 `headsign`：映射有值→該值；映射為 null 或查不到→`null`。
- 任一路線查詢丟錯 → 該路線 headsign 留空（null），**不中斷其他列**。
- `VariantReviewSummary` 加 `headsign: string | null`。

## 3. API 接線

- `GET /api/review/summary` 的 DI 組裝 `PrismaGtfsReadRepository` → `GetRouteVariantsUseCase`
  → `GtfsVariantHeadsignAdapter`，注入 use-case。回應每筆含 headsign。
- 未 seed GTFS / route 不存在 → headsign 優雅降級為 null，端點不掛。

## 4. 前端

- `api-client` 的 `VariantReviewSummary` 加 `headsign`。
- `ReviewDashboard` 每列主標顯示 `headsign`（null → 「未標示終點」），
  「路線 {routeId}」降為次要小字，方向徽章保留。

## 5. 測試（TDD，全綠）

- adapter：映射、`RouteNotFoundError`→[]、其他錯誤上拋。
- use-case：分組（同路線只查一次）、補值、查不到→null、某路線失敗→該列 null 不中斷。
- API route 整合測試：回應含 headsign（未 seed GTFS → null，驗證降級與欄位流通；afterAll 自清）。
- api-client：型別/解析涵蓋 headsign。
- ReviewDashboard：渲染 headsign 與 null→未標示終點。

## Non-goals
- headsign 落庫；variant 列表既有 headsign 行為；快取層。
