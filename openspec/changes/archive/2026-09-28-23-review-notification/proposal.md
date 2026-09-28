# Proposal: 23-review-notification

狀態：`proposed`（使用者已授權連續開發，決策直接鎖定）
編號：23。

## Why

司機需要「該複習了」的主動提醒。本 change 交付**前景 Web Notification**：請求瀏覽器通知權限，
App 開啟且有到期複習時跳出系統通知。純前端、重用 `getReviewSummary`、不改 schema。

> 真正的**背景推播**（App 關閉也收到）需要 Service Worker + Push API + VAPID 金鑰 +
> 訂閱儲存（schema）+ **定時發送的伺服器程序**。本專案目前無背景排程/發送端，故列為後續
> （見 Non-goals）；本 change 先交付現在能真正運作、可測的前景通知。

## What Changes

### `ReviewNotifier`（client component）
- 偵測 `Notification` 支援與權限狀態：
  - 不支援（無 `window.Notification`）或 `denied` → 不顯示、不動作。
  - `default` → 顯示「開啟複習提醒」按鈕；點擊 → `Notification.requestPermission()`，更新狀態。
  - `granted` → 不顯示 UI；掛載時抓 `getReviewSummary`，若到期總數 `totalDue > 0` →
    `new Notification('待複習提醒', { body: '你有 N 張卡片待複習' })`（ref 防重入，每次掛載最多一則）。
- 抓取失敗/無到期 → 不發通知、靜默。
- 置於首頁（提醒橫幅附近）。

## 決策（鎖定）
1. ✅ 本 change 做**前景 Web Notification**（無新基建）；背景 web-push 列後續。
2. ✅ `default` 顯示啟用按鈕；`granted` 有到期才發、每次掛載最多一則；`denied`/不支援不顯示。
3. ✅ 位置＝首頁。

## Non-goals
- 背景 web-push（SW + VAPID + 訂閱儲存 + 定時發送端）→ 需新基建，後續 change。
- 通知排程/靜音時段/自訂內容。

## 影響
- 新增：`src/app/_components/review-notifier.tsx` 及測試。
- 修改：`src/app/page.tsx`、首頁整合測試。
- 完成後於 `specs/` 建 spec 並 archive。
