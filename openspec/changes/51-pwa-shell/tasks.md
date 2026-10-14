# Tasks: 51-pwa-shell

> TDD。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。
> 範圍只含 A（可安裝＋訊號差不白屏）；B（完全離線練習）需先經人決定，不在本 change。

## Phase 51.1: 可安裝
- [x] Task 1: `app/manifest.ts` + 可重現的圖示產生腳本與 PNG（192／512／maskable／apple 180）+ viewport 品牌色 <!-- id: 51-01 -->
- [x] Task 2: proxy 例外：manifest、`sw.js`、圖示、`/offline.html` 不需登入 <!-- id: 51-02 -->

## Phase 51.2: Service Worker
- [x] Task 3: `public/offline.html`（雙語、無外部資源、重試鈕） <!-- id: 51-03 -->
- [x] Task 4: `public/sw.js`（導覽 network-first＋離線頁；靜態快取優先＋數量上限；不快取 /api 與 HTML；版本化；出錯放行） <!-- id: 51-04 -->
- [x] Task 5: `ServiceWorkerRegister`（只在 production、失敗靜默）掛進 layout；`next.config` 為 `/sw.js` 設標頭 <!-- id: 51-05 -->

## Phase 51.3: 使用者體驗
- [ ] Task 6: `OfflineBanner`（`role="status"`、i18n en／zh-TW） <!-- id: 51-06 -->
- [ ] Task 7: 練習頁在 SUBMIT_FAILED 時，恢復連線自動重送一次（沿用冪等重送） <!-- id: 51-07 -->

## Phase 51.4: 收尾
- [ ] Task 8: 守門三綠；真瀏覽器離線驗證；更新 spec／HANDOFF（含「自我註銷 SW」救援作法）／DEPLOY；archive；PR <!-- id: 51-08 -->
