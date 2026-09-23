# Tasks: 12-browsing-enrollment-status

> 從第一個未勾 task 開始，照 TDD（先紅後綠），每步跑 `npm test`（前端 mock fetch、不需 DB）。
> 完成一個就勾起來並 commit。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 12.1: 載入時反映既有報名
- [x] Task 1: 寫失敗測試：VariantList 載入時，已出現在 review summary 的 variant 直接顯示 status + 「開始練習」、且無「報名」鈕 <!-- id: 12-01 -->
- [x] Task 2: 寫失敗測試：未出現在 summary 的 variant 仍顯示「報名」鈕 <!-- id: 12-02 -->
- [x] Task 3: 實作——VariantList 掛載時並行 `getRouteVariants` + `getReviewSummary`，以 variantKey 合併既有報名狀態 until PASS <!-- id: 12-03 -->

## Phase 12.2: 降級與韌性
- [x] Task 4: 寫失敗測試：`getReviewSummary` 失敗時降級為「全部未報名」、不顯示錯誤、variant 列表仍正常渲染 <!-- id: 12-04 -->
- [x] Task 5: 實作降級處理 until PASS <!-- id: 12-05 -->
- [x] Task 6: 確認既有報名互動測試（點報名→POST→更新）仍綠；必要時調整以相容新載入邏輯 <!-- id: 12-06 -->

## Phase 12.3: 守門與收尾
- [x] Task 7: 全套守門（`npm run lint` + `npm test` + `npm run build` 全綠）<!-- id: 12-07 -->
- [ ] Task 8: 建 `specs/` spec；`openspec archive 12-browsing-enrollment-status`；開 PR <!-- id: 12-08 -->

## 注意
- 純前端；重用現有 `/api/routes/[id]/variants` 與 `/api/review/summary`，不動後端。
- summary 為增益資料：抓取失敗要安靜降級，不可讓 variant 主列表掛掉。
- 前端測試 mock fetch 依 URL 分派兩個回應。
