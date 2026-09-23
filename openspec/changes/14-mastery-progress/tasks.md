# Tasks: 14-mastery-progress

> 從第一個未勾 task 開始，照 TDD（先紅後綠），每步跑 `npm test`。
> 前端 mock fetch、後端整合測試打真 DB。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。
> 整合測試務必 afterAll 自清（避免污染其他測試）。

## Phase 14.1: 後端 masteredCount
- [x] Task 1: 寫失敗測試：`GetReviewSummaryUseCase` 計算 masteredCount（全精熟/零精熟/無卡邊界）<!-- id: 14-01 -->
- [x] Task 2: 實作——DTO 加 masteredCount，use-case 計算 `state === MASTERED` 卡數 until PASS <!-- id: 14-02 -->
- [x] Task 3: 寫失敗測試 + 確認 `GET /api/review/summary` 回應含 masteredCount（整合測試，afterAll 自清）until PASS <!-- id: 14-03 -->

## Phase 14.2: 前端顯示
- [x] Task 4: api-client `VariantReviewSummary` 型別加 masteredCount；更新既有 review-api-client 測試 <!-- id: 14-04 -->
- [x] Task 5: 寫失敗測試：ReviewDashboard 每列渲染精熟度 ProgressBar（顯示 masteredCount/totalCards）<!-- id: 14-05 -->
- [x] Task 6: 實作 ReviewDashboard 精熟度進度條 until PASS；既有 dashboard 測試補 masteredCount 欄位仍綠 <!-- id: 14-06 -->

## Phase 14.3: 守門與收尾
- [ ] Task 7: 全套守門（`npm run lint` + `npm test` + `npm run build` 全綠）<!-- id: 14-07 -->
- [ ] Task 8: 建 `specs/` spec；`openspec archive 14-mastery-progress`；開 PR <!-- id: 14-08 -->

## 注意
- masteredCount 與 newCount 同套 cards.filter 算法，無需新依賴/schema。
- 既有測試的 summary mock 資料要補 masteredCount 欄位（否則型別/斷言失敗）。
- 前端 ProgressBar 已存在於 `src/components/ui`，直接重用。
