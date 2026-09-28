# Tasks: 23-review-notification

> TDD（先紅後綠）。前端 mock fetch + mock Notification API。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 23.1: ReviewNotifier
- [x] Task 1: 寫失敗測試：permission `default` → 顯示「開啟複習提醒」按鈕；點擊呼叫 `Notification.requestPermission` <!-- id: 23-01 -->
- [x] Task 2: 寫失敗測試：permission `granted` + 到期>0 → 觸發 `new Notification`（body 含數量）、無按鈕；到期=0 不觸發；`denied`/不支援 → 不顯示不觸發 <!-- id: 23-02 -->
- [x] Task 3: 實作 `ReviewNotifier`（偵測支援/權限、default 按鈕、granted 抓 summary 發一則、ref 防重入）until PASS <!-- id: 23-03 -->

## Phase 23.2: 首頁整合
- [ ] Task 4: 寫失敗測試 + 把 ReviewNotifier 掛進首頁 until PASS；既有首頁測試仍綠 <!-- id: 23-04 -->

## Phase 23.3: 守門與收尾
- [ ] Task 5: 全套守門（lint + test + build 全綠）<!-- id: 23-05 -->
- [ ] Task 6: 建 `specs/` spec；`openspec archive 23-review-notification`；開 PR <!-- id: 23-06 -->

## 注意
- 測試 mock `globalThis.Notification`（constructor spy + 靜態 permission + requestPermission）；不支援案例不 stub。
- 純前端、重用 getReviewSummary；載入/錯誤靜默；granted 每次掛載最多發一則（ref）。
- SSR 安全：存取 Notification 前檢查 `typeof window !== 'undefined' && 'Notification' in window`。
