# Proposal: 13-practice-deep-link

狀態：`proposed`（等人審通過後進入實作）
編號：13。

## Why

所有「開始練習」CTA（Change 11 儀表板、Change 12 variant 列表）目前一律連到 `/practice/recall`，
**不帶任何 context**。而 `/practice/recall`（Change 10）的 IDLE 表單要司機**手動打字輸入 `variantKey`**
（預設還是假值 `66-1-INBOUND`）。等於司機按了某條路線的「開始練習」，卻被丟到一個要自己背出
variantKey 才能開始的表單——CTA 形同虛設。

Change 13 讓「開始練習」**deep-link 帶上 `routeId` + `variantKey`**，`/practice/recall` 讀取後
**直接開始該 variant 的 session**，不必手動輸入。純前端、重用既有 `startSession`，不動後端。

## What Changes

### 1. CTA 帶參數
- Change 11 `ReviewDashboard` 與 Change 12 `VariantList` 的「開始練習」連結改為
  `/practice/recall?routeId={routeId}&variantKey={variantKey}`。

### 2. `/practice/recall` 消費參數並自動開始
- 頁面讀取 URL query（App Router `useSearchParams`，Next 16 需 `Suspense` 邊界）。
- 當 `routeId` + `variantKey` 皆存在：
  - 預填表單狀態，並在 IDLE 時**自動開始一次** session（`startSession({ routeId, variantKey })`，
    sessionSize 用預設）。以 ref 防重入，避免重複開 session。
  - `sessionSize` 可選帶（`&size=`），無則用預設。
- **無參數時**：維持原本手動 IDLE 表單（直接造訪的 fallback，行為不變）。

### 3. Suspense 重構
- 因 `useSearchParams` 在 App Router 需包在 `Suspense` 內，將現有 client 頁面拆成
  `page.tsx`（thin wrapper：`<Suspense>` 包住）＋ 內層練習元件（讀 searchParams）。
- 動手前讀 `node_modules/next/dist/docs/` 的 App Router `use-search-params` 指南確認 Next 16 寫法。

### 4. 測試策略（TDD）
- CTA 連結測試：ReviewDashboard / VariantList 的「開始練習」href 帶正確 query。
- 消費測試：mock `useSearchParams` 回傳 routeId+variantKey → 頁面自動呼叫 `startSession`
  帶正確參數且只呼叫一次；無參數 → 維持手動表單、不自動開始。
- 既有 recall 頁測試仍綠。

## Non-goals
- 後端改動（`startSession` 契約已足夠）。
- 練習佇列演算法、sessionSize UI 精修、跨 variant 混合佇列。
- headsign 顯示、SRS 精熟度視覺化（各為後續 change）。

## 影響
- 修改：`ReviewDashboard`、`VariantList`（連結）、`src/app/practice/recall/page.tsx`
  （Suspense 拆分 + 消費參數 + 自動開始）及對應測試。
- 完成後於 `specs/` 建 spec 並 archive。

## 開放問題（請審核時定案）
1. deep-link 帶參數時**自動開始** session，還是只預填表單、讓司機再按一次「開始」？
   （傾向**自動開始**——他已經按了「開始練習」，再要求按一次多餘。）
2. 自動開始後若 `startSession` 失敗（如該 variant 無可練卡片 / 尚未報名），行為為何？
   （傾向沿用 `useRecallSession` 既有錯誤/空狀態呈現，不特別處理。）
