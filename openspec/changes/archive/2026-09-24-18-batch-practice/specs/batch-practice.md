# Specification: Batch Practice (Change 18)

多路線批次練習：一鍵把所有到期 variant 排成佇列，練習頁逐一串接單 variant session。
**前端編排**——重用 `startSession` / `useRecallSession` / `getReviewSummary`，不動後端。

## 1. 佇列編碼（`src/app/_lib/practice-queue.ts`）

- `QueueItem = { routeId, variantKey }`。
- `encodeQueue(items)` = `encodeURIComponent(JSON.stringify([{routeId,variantKey}...]))`
  （variantKey 可能含冒號，故用 JSON 而非分隔字元）。
- `parseQueue(raw)`：null/空/非 JSON/非陣列/缺欄 → 一律回 `[]`（降級為無佇列）。

## 2. 入口：「練習全部到期」（`BatchPracticeButton`）

- 呼叫 `getReviewSummary()`，取 `dueCount > 0` 的 variant（summary 已依 dueCount 排序）組佇列。
- 有到期 → 連結「練習全部到期（N 條路線）」→ `/practice/recall?queue=<encodeQueue>`。
- 無到期 / 載入中 / 錯誤 → 不顯示（回傳 null）。
- 置於首頁「待複習」儀表板上方（提醒橫幅之下）。

## 3. 練習頁佇列流程（`/practice/recall`）

- 讀 `queue` 參數（沿用 Change 13 的 `useSearchParams` + Suspense）→ `parseQueue`。
- `inBatch = queue.length > 0`；`batchIndex` 由 0 起。
- **自動開始**（沿用 Change 13、ref 防重入）：inBatch → 開始 `queue[0]`；否則單 variant deep-link。
- header 顯示「批次練習 {batchIndex+1} / {queue.length}」。
- `COMPLETED` 時：
  - `batchIndex < queue.length-1` → 「下一條路線（i/n）」按鈕 → `startSession(queue[next])`、`batchIndex+1`。
  - 否則（最後一條）→ 顯示「全部完成 🎉」＋ Practice Again。
- 無 `queue` → 行為與 Change 13 完全一致（單 variant / 手動表單）。

## 4. 測試（TDD，全綠）

- 佇列 codec：round-trip（含冒號 variantKey）、壞字串/非陣列/缺欄→[]。
- 入口按鈕：由 summary 組佇列與 href、文案含路線數、無到期不顯示、錯誤靜默。
- 練習頁（mock useSearchParams + useRecallSession）：自動開始第 0 條 + 批次進度 1/n；
  COMPLETED 有下一條→按鈕點擊 startSession 下一條；最後一條→全部完成。
- 既有 deep-link / recall 頁 / 首頁測試無回歸。

## Non-goals
- 後端跨 variant 單一 session；佇列自訂勾選 UI；自動連播（採手動「下一條」）。
