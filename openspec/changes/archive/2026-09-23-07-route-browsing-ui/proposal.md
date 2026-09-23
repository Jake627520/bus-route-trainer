# Proposal: 07-route-browsing-ui

狀態：`proposed`（等人審通過後進入實作）

## Why

Changes 01–06 建立了完整的後端引擎（GTFS 匯入/讀取、司機學習狀態、recall session 領域、複習結算）與 HTTP API，但**前端仍是 Next.js 預設樣板**——司機沒有任何可用畫面。

Change 07 交付**第一個前端 vertical slice**：只用「現有的」API，讓司機能瀏覽路線、選 variant、報名（enroll）、看到自己的學習進度。刻意不碰 recall 練習畫面（因為 recall 尚無 HTTP API，屬後續 change）。

## What Changes

### 1. 範圍（只串現有 API）
- `GET /api/routes` → 路線列表頁
- `GET /api/routes/{routeId}/variants` → 某路線的 variant 列表
- `POST /api/progress/enroll` → 對某 variant 報名
- `GET /api/progress/{variantKey}` → 顯示該 variant 的學習進度

### 2. 畫面（App Router，`src/app/`）
- `/`（路線列表）：呼叫 `/api/routes`，顯示 `shortName` + `longName`，可點進路線。
- `/routes/[routeId]`（路線詳情）：呼叫 variants API，列出各 variant；每個 variant 有「Enroll」按鈕與進度狀態。
- Enroll 動作：POST enroll，成功後就地更新該 variant 的進度（呼叫 progress API 或用回傳的 `data`）。

### 3. 資料存取策略
- 前端一律透過**既有 HTTP API**取資料，不直接 import Prisma/use-case（維持前後端邊界）。
- 抽一個薄的 API client（`src/app/_lib/api-client.ts`）集中 fetch 與錯誤形狀解析（`{ data }` / `{ error }`）。

### 4. 測試策略（TDD）
- 元件測試：Vitest + Testing Library + jsdom，**mock fetch**（不打真 DB，前端測試維持快速、與後端整合測試分離）。
- 覆蓋：載入中 → 成功渲染、空清單、API 錯誤（顯示錯誤訊息）、Enroll 點擊觸發 POST 並更新畫面。

## Non-goals
- recall 練習畫面 / recall HTTP API（後續 change）。
- 認證（維持 zero-auth，`DEFAULT_DRIVER_ID`）。
- SRS 排程視覺化、樣式打磨、i18n。

## 影響
- 新增 `src/app/page.tsx`（取代預設樣板）、`src/app/routes/[routeId]/page.tsx`、`src/app/_lib/api-client.ts` 及對應元件與測試。
- 完成後於 `openspec/specs/` 建立 `route-browsing-ui` spec 並 archive 本 change。
