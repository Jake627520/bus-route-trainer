# Proposal: 14-mastery-progress

狀態：`proposed`（等人審通過後進入實作）
編號：14。

## Why

複習儀表板（Change 11）目前顯示到期數 / 新卡 / 下次複習，但**沒有「學到多少」的整體進度感**。
司機看不到某條 variant 已精熟幾張、離全部精熟還有多遠——缺少激勵性的進度視覺。

後端 `GetReviewSummaryUseCase` 已經拿得到每張卡的 `state`（`findAllByDriver` 回傳含 cards），
所以加 `masteredCount`（`state === MASTERED` 的卡數）只是**一行**，與現有 `newCount` 同套算法、
**無需新依賴或 schema 變更**。前端用 Change 10 已有的 `ProgressBar` primitive 顯示 `masteredCount / totalCards`。

## What Changes

### 1. 後端：summary 增 `masteredCount`
- `VariantReviewSummary` 加 `masteredCount: number`（`cards.filter(state === MASTERED).length`）。
- `GetReviewSummaryUseCase` 計算之；api-client 的 `VariantReviewSummary` 型別同步加欄位。
- 排序、其餘欄位不變。

### 2. 前端：儀表板顯示精熟度進度
- `ReviewDashboard` 每列加一條精熟度進度（重用 `ProgressBar`，`current=masteredCount`、`total=totalCards`，
  label 例如「精熟度」）。`totalCards=0` 時安全顯示 0%。

### 3. 測試策略（TDD）
- use-case：masteredCount 計算（含全精熟、零精熟、無卡）。
- API route：回應含 masteredCount。
- api-client：型別/解析涵蓋新欄位。
- ReviewDashboard：渲染 ProgressBar 並顯示 masteredCount/totalCards。

## Non-goals
- 精熟度的歷史趨勢圖、跨 variant 匯總；SRS 演算法調整；headsign 顯示（後續）。

## 影響
- 修改：`get-review-summary-use-case.ts`、`api-client.ts`（型別）、`review-dashboard.tsx` 及對應測試。
- 完成後於 `specs/` 建 spec 並 archive。

## 決策（2026-09-23 人審定案）
1. ✅ 進度條 label「精熟度」+ ProgressBar 內建 `X / Y (Z%)`。
2. ✅ 精熟度 0 的 variant 仍顯示進度條（0% 也是有效資訊）。
