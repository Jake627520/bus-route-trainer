# Tasks: 16-review-reminder

> 從第一個未勾 task 開始，照 TDD（先紅後綠），每步跑 `npm test`（前端 mock fetch、不需 DB）。
> 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 16.1: ReviewReminder 橫幅
- [x] Task 1: 寫失敗測試：totalDue>0 → 顯示「你有 N 張卡片待複習」＋開始複習 CTA deep-link 到到期最多 variant <!-- id: 16-01 -->
- [x] Task 2: 寫失敗測試：totalDue===0 且有 enrolled → 鼓勵訊息「都完成了」；無 enrolled → 不顯示；載入中/錯誤 → 靜默（無 spinner/alert）<!-- id: 16-02 -->
- [x] Task 3: 實作 `ReviewReminder`（getReviewSummary → totalDue、取 items[0] deep-link）until PASS <!-- id: 16-03 -->

## Phase 16.2: 首頁整合
- [x] Task 4: 寫失敗測試：首頁最上方渲染 ReviewReminder（在「待複習」儀表板之上）<!-- id: 16-04 -->
- [x] Task 5: 把 ReviewReminder 掛進 `src/app/page.tsx` until PASS；既有首頁測試仍綠 <!-- id: 16-05 -->

## Phase 16.3: 守門與收尾
- [x] Task 6: 全套守門（`npm run lint` + `npm test` + `npm run build` 全綠）<!-- id: 16-06 -->
- [x] Task 7: 建 `specs/` spec；`openspec archive 16-review-reminder`；開 PR <!-- id: 16-07 -->

## 注意
- 純前端；重用 `apiClient.getReviewSummary()`（summary 已依 dueCount 由多到少排序）。
- 提醒為增益：載入/錯誤靜默，不阻塞首頁；無 enrolled 不顯示。
- deep-link 沿用 Change 13 的 `/practice/recall?routeId=..&variantKey=..` 格式（URLSearchParams）。
- 首頁整合測試 mock fetch 依 URL 分派（reminder + dashboard + routes 三者共用 /api/review/summary 與 /api/routes）。
