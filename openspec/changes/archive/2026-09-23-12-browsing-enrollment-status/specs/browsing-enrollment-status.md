# Specification: Browsing Enrollment Status (Change 12)

修正 Change 07 路線瀏覽的 UX 缺口：variant 列表載入時未反映既有報名，重整後就「忘記」。
純前端、重用現有 API（不動後端/schema）。

## 1. 載入時反映既有報名

- `VariantList` 掛載時**並行**兩個請求：
  - `getRouteVariants(routeId)`——主資料，決定載入中/成功/空/錯誤狀態。
  - `getReviewSummary()`——增益資料，取得該 driver 所有 enrolled variant 的 `variantKey + status`。
- 以 `variantKey` 合併：summary 中出現的 variant 標記為**已報名**，seed 其 `enrolledStatus`。
- 已報名列渲染 `STATUS_LABEL[status]`（已報名·尚未開始 / 學習中 / 已精熟）＋「開始練習」
  入口（`/practice/recall`，全域練習佇列，不帶 variant 參數）；不顯示「報名」鈕。
- 未報名列維持「未報名」＋「報名」鈕。

## 2. 合併規則與韌性

- seed 時**不覆寫**使用者當次已操作的列（`if (!next[variantKey])` 才寫入），避免 race 蓋掉剛報名的結果。
- summary 為增益：抓取失敗 → **安靜降級**，該路線所有 variant 視為未報名，
  **不顯示任何錯誤或提示**，variant 主列表照常渲染。
- 載入指示以 variant 主請求為準；summary 尚未回來不阻塞畫面。

## 3. 報名互動（沿用 Change 07）

- 點「報名」→ `POST /api/progress/enroll` → 成功就地更新該列 `enrolledStatus`，
  改顯示 status + 開始練習；失敗顯示 inline 錯誤且可重試。
- 內部狀態由原本存 full `VariantProgress` 精簡為 `enrolledStatus: ProgressStatus | null`
  （渲染只需 status）。

## 4. 測試（TDD，全綠）

- 前端 mock fetch **依 URL 分派** variants / summary / enroll 三種回應：
  - 已報名 variant 載入即顯示 status + 開始練習、無報名鈕。
  - 未報名 variant 顯示報名鈕。
  - summary 失敗 → 全部未報名、無錯誤、主列表正常。
  - 既有 enroll 互動（成功更新 / 失敗重試 / payload 不含 driverId）改 by-URL mock 後仍綠。

## Non-goals
- 後端新增「列舉 enrolled variantKeys」端點（先重用 summary）。
- 帶 variant 參數只練該 variant、headsign 顯示、進度細節頁（各為後續）。
