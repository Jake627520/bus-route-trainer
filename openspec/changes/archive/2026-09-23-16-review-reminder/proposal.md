# Proposal: 16-review-reminder

狀態：`proposed`（等人審通過後進入實作）
編號：16。

## Why

儀表板（Change 11/14/15）已能逐條列出各 variant 的到期數，但**沒有一個「一眼看到、催你行動」的總提醒**。
司機一落地首頁，需要一句「你今天有 N 張卡片待複習」＋一鍵直接開練，才有回訪與練習的驅動力。

Change 16 交付**輕量 in-app 待複習提醒橫幅**：置於首頁最上方，彙總所有 enrolled variant 的到期總數，
並直接 deep-link 到最該複習的 variant（重用 Change 13）。純前端、重用現有 `getReviewSummary`，不動後端。

## What Changes

### 1. `ReviewReminder` 提醒橫幅（client component）
- 掛載時呼叫 `getReviewSummary()`，計算**到期總數** `totalDue = Σ item.dueCount`。
- 呈現：
  - `totalDue > 0`：顯著橫幅「你有 {totalDue} 張卡片待複習」＋「開始複習」CTA，
    deep-link 到**到期最多的 variant**（summary 已依 dueCount 由多到少排序 → 取 `items[0]`，
    連 `/practice/recall?routeId=..&variantKey=..`）。
  - `totalDue === 0` 且有 enrolled：鼓勵訊息「今天的複習都完成了 🎉」。
  - 無 enrolled（summary 空）：**不顯示**（首頁下方儀表板的空狀態已處理）。
- 提醒為增益：**載入中與錯誤一律靜默**（不顯示 spinner/錯誤，不阻塞首頁其他內容）。

### 2. 首頁整合
- `ReviewReminder` 置於首頁 `/` 最上方（header 之下、「待複習」儀表板之上）。

## Non-goals
- 瀏覽器 Notification API、Service Worker、排程/推播通知（需額外基建，屬後續 change）。
- 後端改動、跨 variant 佇列語義。

## 影響
- 新增：`src/app/_components/review-reminder.tsx` 及測試。
- 修改：`src/app/page.tsx`（掛入橫幅）及首頁整合測試。
- 完成後於 `specs/` 建 spec 並 archive。

## 決策（2026-09-23 人審定案）
1. ✅ totalDue===0（有 enrolled）顯示鼓勵訊息「都完成了」，非整條消失。
2. ✅ 「開始複習」deep-link 到到期最多的 variant（items[0]）。
