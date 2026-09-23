# Specification: Route Browsing UI (Change 07)

第一個前端 vertical slice：司機瀏覽路線 → 選 variant → 報名 → 看進度。
只串現有 HTTP API（Changes 01–06 的 GTFS 讀取與 learning state），不直接碰
Prisma / use-case，維持前後端邊界。Zero-auth 階段 client 不送 `driverId`。

## 1. API Client（`src/app/_lib/api-client.ts`）

薄 fetch 封裝，集中信封解析：

- 成功回應統一為 `{ data: T }` → 解包回傳 `T`。
- 失敗回應統一為 `{ error: { code, message } }` → 拋 `ApiError`，
  攜帶後端 `code` 與 HTTP `status`；network 失敗為 `code='NETWORK_ERROR'`、`status=0`；
  非 JSON 回應為 `code='INVALID_RESPONSE'`。
- 提供方法：`getRoutes()`、`getRouteVariants(routeId)`、
  `enroll({ routeId, variantKey })`、`getVariantProgress(variantKey)`。
- `fetchFn` 可注入（測試用）；未注入時於呼叫當下 late-bind `globalThis.fetch`，
  以相容 `vi.stubGlobal`。
- client payload 嚴禁含 `driverId`。

## 2. 路線列表（`/`，`src/app/page.tsx` + `RouteList`）

- 取代 Next.js 預設樣板。
- 呼叫 `GET /api/routes`，四種狀態：
  - **載入中**：`role="status"` 指示。
  - **成功**：每條路線渲染 `shortName` + `longName`，可點進 `/routes/{id}`。
  - **空清單**：友善空狀態文案。
  - **錯誤**：`role="alert"` 顯示錯誤訊息。

## 3. 路線詳情（`/routes/[routeId]`，Server page + `VariantList`）

- Next 16 async params：`params: Promise<{ routeId }>`，於 server component `await` 後帶入。
- `VariantList`（client）呼叫 `GET /api/routes/{routeId}/variants`：
  - 每個 variant 顯示方向（0=去程 / 1=返程）、終點 headsign（null → 「未標示終點」）、
    站數、班次，以及**各自進度狀態**（初始「未報名」）。
  - 載入中 / 空 / 錯誤狀態同上。

## 4. Enroll 互動

- 每個未報名 variant 有「報名」按鈕 → `POST /api/progress/enroll`（body `{ routeId, variantKey }`）。
- 成功（201 新報名 / 200 已存在）：以回傳的 `data`（progress）**就地更新該列**，
  顯示進度狀態並改為「開始練習」入口（`/practice/recall`）。
- 失敗：該列顯示 inline `role="alert"` 錯誤，按鈕恢復可重試。
- 報名進行中：按鈕 `aria-busy` 且 disabled。

## 5. 測試策略（TDD）

- Vitest + Testing Library + jsdom，一律 **mock fetch，不打真 DB**（與後端整合測試分離）。
- 覆蓋：api-client 信封/錯誤/network、列表四態、variant 渲染與 null headsign、
  enroll 成功更新與失敗重試、payload 不含 driverId。

## Non-goals

- recall 練習畫面本身（屬 Change 09/10）、認證、SRS 視覺化、i18n、樣式精修。
