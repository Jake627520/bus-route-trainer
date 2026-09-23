# Tasks: 18-batch-practice

> 從第一個未勾 task 開始，照 TDD（先紅後綠），每步跑 `npm test`（前端 mock fetch/hook、不需 DB）。
> 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 18.1: 佇列編碼 helper
- [x] Task 1: 寫失敗測試：`encodeQueue` / `parseQueue`（round-trip、variantKey 含冒號、壞字串→[]）<!-- id: 18-01 -->
- [x] Task 2: 實作 helper（JSON + encodeURIComponent，parse try/catch→[]）until PASS <!-- id: 18-02 -->

## Phase 18.2: 入口按鈕
- [ ] Task 3: 寫失敗測試：批次入口元件——由 summary 取 dueCount>0 組佇列、href=/practice/recall?queue=..、無到期不顯示、按鈕文案含路線數 <!-- id: 18-03 -->
- [ ] Task 4: 實作入口元件 until PASS <!-- id: 18-04 -->

## Phase 18.3: 練習頁佇列流程
- [ ] Task 5: 寫失敗測試（mock useSearchParams+useRecallSession）：有 queue → 自動開始第 0 條、header 顯示「批次練習 1/n」 <!-- id: 18-05 -->
- [ ] Task 6: 寫失敗測試：COMPLETED 且有下一條 → 顯示「下一條路線 (2/n)」，點擊 → reset + startSession 下一條；最後一條完成 → 「全部完成」 <!-- id: 18-06 -->
- [ ] Task 7: 實作練習頁佇列讀取 + 批次進度 + 下一條流程 until PASS；既有 recall 頁 / deep-link 測試仍綠 <!-- id: 18-07 -->

## Phase 18.4: 首頁整合 + 守門收尾
- [ ] Task 8: 把批次入口掛進首頁（提醒/待複習附近）；整合測試 until PASS <!-- id: 18-08 -->
- [ ] Task 9: 全套守門（`npm run lint` + `npm test` + `npm run build` 全綠）<!-- id: 18-09 -->
- [ ] Task 10: 建 `specs/` spec；`openspec archive 18-batch-practice`；開 PR <!-- id: 18-10 -->

## 注意
- 純前端；重用 `startSession` / `useRecallSession` / `getReviewSummary`，不動後端。
- 佇列用 JSON 編碼（variantKey 可能含冒號）；解析失敗一律降級為無佇列（既有單 variant 行為）。
- 自動開始沿用 Change 13（ref 防重入）；下一條為手動按鈕。
- 碰 useSearchParams 的測試要 mock next/navigation；練習頁測試 mock useRecallSession。
