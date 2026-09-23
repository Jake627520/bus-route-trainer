# Proposal: 18-batch-practice

狀態：`proposed`（等人審通過後進入實作）
編號：18。

## Why

目前練習一次只練一個 variant（`startPlannedSession` 嚴格單 variant）。司機若有多條路線到期，
得一條條手動回首頁再點下一條，很煩。**「一鍵練完今天所有到期」**能大幅降低複習摩擦。

改後端讓單一 session 跨多 variant 會動到複雜的 recall 領域核心（RecallSession 模型、
PlanRecallSessionUseCase、已 archive 的 Change 05–10），風險高。**本 change 採前端編排**：
把「所有到期 variant」排成佇列，逐一串接現有的單 variant session，**重用 `startSession` /
`useRecallSession`，零後端改動**。

## What Changes

### 1. 入口：「練習全部到期」
- 首頁新增按鈕「練習全部到期（N 條路線）」：由 review summary 取 `dueCount > 0` 的 variant
  （已依 dueCount 由多到少排序），組成佇列，導向 `/practice/recall?queue=<encoded>`。
- 佇列編碼：`encodeURIComponent(JSON.stringify([{ routeId, variantKey }, ...]))`
  （**因 variantKey 可能含冒號**，用 JSON 而非分隔字元）。
- 無到期時按鈕不顯示（或 disabled）。

### 2. 練習頁支援佇列
- `/practice/recall` 讀 `queue` 參數（沿用 Change 13 的 `useSearchParams` + Suspense）：
  - 解析成 `{ routeId, variantKey }[]`；解析失敗 → 忽略佇列、退回既有單 variant 行為。
  - 自動開始佇列第 0 條（沿用 Change 13 自動開始，ref 防重入）。
  - header 顯示批次進度「批次練習 i / n」。
  - 當一條到達 `COMPLETED`（或 `NO_CARDS_AVAILABLE`）且佇列尚有下一條：
    顯示「下一條路線（i/n）」按鈕 → `reset()` 後 `startSession` 下一條、index+1。
  - 最後一條完成 → 顯示「全部完成 🎉」與回首頁入口。
- 無 `queue` 時行為與現狀完全一致（單 variant / 手動表單）。

### 3. 不改的部分
- 不動後端、不改 recall 領域 / session 契約 / `startPlannedSession`。
- 單 variant deep-link（Change 13）行為不變。

### 4. 測試策略（TDD）
- 佇列編碼/解碼 helper（含 variantKey 含冒號、壞字串→空）。
- 入口按鈕：由 summary 組佇列、href 正確、無到期不顯示。
- 練習頁（mock useSearchParams + useRecallSession）：有 queue → 自動開始第 0 條、顯示 i/n；
  COMPLETED 且有下一條 → 顯示「下一條路線」並點擊後 startSession 下一條；最後一條 → 全部完成。
- 既有 recall 頁 / deep-link 測試仍綠。

## Non-goals
- 後端跨 variant session（風險高，未來若要真正單 session 混合佇列再議）。
- 佇列自訂勾選 UI（先做「全部到期」）、自動連播（先用手動「下一條」按鈕，司機可控）。

## 影響
- 新增：佇列編碼 helper、批次入口按鈕元件、及測試。
- 修改：`src/app/practice/recall/page.tsx`（讀 queue、批次進度、下一條流程）、首頁、對應測試。
- 完成後於 `specs/` 建 spec 並 archive。

## 決策（2026-09-24 人審定案）
1. ✅ 前端編排（串接單 variant session），不動後端。
2. ✅ 路線間手動「下一條路線」按鈕，非自動連播。
3. ✅ 批次＝所有 dueCount>0 的 variant（依 summary 排序）。
4. ✅ 入口按鈕放首頁「待複習」儀表板上方。
