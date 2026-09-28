# Specification: Review Notification (Change 23)

前景 Web Notification 複習提醒：請求瀏覽器通知權限，App 開啟且有到期複習時發系統通知。
純前端、重用 getReviewSummary、不改 schema。

## ReviewNotifier（client component）
- 以 `useSyncExternalStore` 讀 `Notification.permission`（SSR snapshot 'unsupported'，避免 effect setState 與 hydration mismatch）。
- 不支援（無 window.Notification）/ `denied` → 不顯示、不動作。
- `default` → 顯示「開啟複習提醒」按鈕 → `Notification.requestPermission()`，以 override 更新狀態。
- `granted` → 不顯示 UI；掛載時抓 `getReviewSummary`，到期總數>0 → `new Notification('待複習提醒', { body })`（ref 防重入，每次掛載最多一則）。抓取失敗/無到期 → 不發、靜默。
- 置於首頁提醒橫幅之上。

## 測試（TDD 全綠）
default→按鈕+requestPermission；granted+到期→發通知（body 含數量）、無按鈕；到期0 不發；denied/不支援不顯示不發；首頁 default→按鈕出現。

## Non-goals（後續）
背景 web-push（Service Worker + Push API + VAPID + 訂閱儲存 + 定時發送端，需新基建）；排程/靜音時段。
