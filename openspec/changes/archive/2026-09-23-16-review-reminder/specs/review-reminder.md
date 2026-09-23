# Specification: Review Reminder (Change 16)

首頁頂部輕量 in-app 待複習提醒橫幅，彙總到期總數並一鍵直達最該複習的 variant。
純前端、重用 `getReviewSummary`，不動後端。

## 1. `ReviewReminder`（client component）

- 掛載時呼叫 `apiClient.getReviewSummary()`，計算 `totalDue = Σ item.dueCount`。
- 呈現規則：
  - `totalDue > 0`：橫幅「你有 {totalDue} 張卡片待複習」＋「開始複習」CTA。
    CTA deep-link 到**到期最多的 variant**——summary 已由後端依 dueCount 由多到少排序，
    取 `items[0]`，連 `/practice/recall?routeId=..&variantKey=..`（沿用 Change 13 格式）。
  - `totalDue === 0` 且有 enrolled（`items.length > 0`）：鼓勵訊息「今天的複習都完成了 🎉」。
  - 無 enrolled（summary 空）：不顯示（回傳 null）。
- **增益、靜默**：載入中與抓取錯誤一律回傳 null（不顯示 spinner/錯誤，不阻塞首頁其他內容）。

## 2. 首頁整合

- `ReviewReminder` 置於首頁 `/`：header 之下、「待複習」儀表板 section 之上（DOM 順序驗證）。

## 3. 測試（TDD，全綠）

- totalDue>0 → 顯示總數與 CTA deep-link 到 items[0]。
- totalDue===0（有 enrolled）→ 鼓勵訊息、無「待複習」字樣。
- 無 enrolled → 空 DOM。
- 載入中 → 空 DOM、無 status/alert。
- 錯誤 → 空 DOM。
- 首頁整合：橫幅在儀表板標題之上。

## Non-goals
- 瀏覽器 Notification API / Service Worker / 排程推播（需額外基建，屬後續 change）。
- 後端改動、跨 variant 佇列語義。
