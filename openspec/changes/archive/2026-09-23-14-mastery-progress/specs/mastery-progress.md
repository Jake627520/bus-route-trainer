# Specification: Mastery Progress (Change 14)

複習儀表板每列加「精熟度進度」，讓司機看到某 variant 已精熟幾張、離全精熟多遠。
純加法擴充，重用既有資料與 UI primitive。

## 1. 後端：summary 加 masteredCount

- `VariantReviewSummary` 加 `masteredCount: number`。
- `GetReviewSummaryUseCase` 由 cards 計算 `masteredCount = cards.filter(state === MASTERED).length`
  （與 newCount 同套算法）。無新依賴、無 schema 變更、不影響排序與其餘欄位。
- `GET /api/review/summary` 回應自動含 masteredCount（use-case 輸出）。

## 2. 前端：儀表板精熟度進度條

- `api-client` 的 `VariantReviewSummary` 型別同步加 `masteredCount`。
- `ReviewDashboard` 每列用既有 `ProgressBar`（`src/components/ui`）顯示：
  `current = masteredCount`、`total = totalCards`、`label = "精熟度"`，
  ProgressBar 內建呈現 `X / Y (Z%)` 與 `role="progressbar"`（aria-valuenow/valuemax）。
- `totalCards = 0` 時安全顯示 0%。精熟度 0 的 variant 仍顯示進度條（0% 亦為有效資訊）。

## 3. 測試（TDD，全綠）

- use-case：masteredCount 計算（含 MASTERED 卡、零精熟、無卡）。
- API route 整合測試：回應含 masteredCount（seed 一張 MASTERED 卡；afterAll 自清）。
- api-client：型別/解析涵蓋 masteredCount。
- ReviewDashboard：渲染 ProgressBar，aria-valuenow/valuemax 與 `X / Y` 文字正確。

## Non-goals
- 精熟度歷史趨勢、跨 variant 匯總；SRS 演算法調整；headsign 顯示（後續）。
