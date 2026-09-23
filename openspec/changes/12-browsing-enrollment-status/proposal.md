# Proposal: 12-browsing-enrollment-status

狀態：`proposed`（等人審通過後進入實作）
編號：12（07 撞號已跳過、11 已用）。

## Why

Change 07 的 `/routes/[routeId]` variant 列表，**每次載入都把所有 variant 顯示為「未報名」＋報名鈕**，
只有在「當次 session 點了報名」後那一列才會更新。重新整理或之後再進來，**畫面就「忘記」司機早已報名**，
看起來像壞掉，也讓司機無法從路線頁直接回到已報名 variant 的練習。

Change 11 已有 `GET /api/review/summary`，會回傳該 driver **所有 enrolled variant 的 variantKey + status**。
Change 12 只要在 variant 列表載入時比對它，就能正確反映既有報名狀態——**純前端、重用現有 API、無需動後端或 schema**。

## What Changes

### 1. VariantList 載入時判斷既有報名
- `VariantList` 掛載時，除了 `getRouteVariants(routeId)`，同時呼叫一次 `getReviewSummary()`。
- 以 `variantKey` 比對：某 variant 若出現在 summary 中 → 視為**已報名**，顯示其 `status`
  （已報名·尚未開始 / 學習中 / 已精熟）與「開始練習」入口（`/practice/recall`）；
  否則維持「未報名」＋「報名」鈕。
- 報名成功後（既有流程）仍就地更新該列為已報名（與載入時邏輯一致）。

### 2. 狀態合併與載入處理
- 兩個請求並行；summary 失敗不應讓整頁掛掉（variant 列表為主資料，summary 為增益）：
  summary 抓取失敗時**降級**為「全部視為未報名」（原行為），不顯示錯誤中斷。
- 載入指示以 variant 主請求為準。

### 3. 不改的部分
- 不動後端、不改 `/api/review/summary` 契約、不新增 API。
- 報名 POST 流程、UI primitives 皆沿用。

### 4. 測試策略（TDD）
- 前端 mock fetch（依 URL 分派 variants 與 summary 兩個回應）：
  - 已報名 variant 載入即顯示 status + 開始練習、無報名鈕。
  - 未報名 variant 顯示報名鈕。
  - summary 失敗 → 降級為全部未報名、不顯示錯誤、variant 列表仍正常。
  - 既有報名互動測試仍綠。

## Non-goals
- 後端新增「列舉 enrolled variantKeys」專用端點（先重用 summary；若日後 summary 语義分家再議）。
- 進度細節頁、SRS 視覺化、headsign 顯示（各為獨立後續）。

## 影響
- 修改：`src/app/_components/variant-list.tsx` 與其測試；可能微調 `ReviewDashboard`/api-client 無。
- 完成後於 `specs/` 建 spec 並 archive。

## 開放問題（請審核時定案）
1. summary 抓取失敗時，除了降級為「未報名」，要不要在頁面角落顯示一個不中斷的小提示？（傾向不顯示，保持安靜降級。）
2. 「開始練習」目前一律連 `/practice/recall`（全域練習佇列）。本 change 是否需要帶 variant 參數只練該 variant？（傾向維持現狀，帶參數屬後續。）
