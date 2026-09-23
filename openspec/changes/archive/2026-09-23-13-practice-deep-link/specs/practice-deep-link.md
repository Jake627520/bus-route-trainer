# Specification: Practice Deep-Link (Change 13)

讓「開始練習」CTA deep-link 帶 `routeId` + `variantKey`，`/practice/recall` 讀取後
直接自動開始該 variant 的 session，免手動輸入 variantKey。純前端、重用 `startSession`。

## 1. CTA 帶參數

- `ReviewDashboard`（Change 11）與 `VariantList`（Change 07/12）的「開始複習／開始練習」
  連結改為 `/practice/recall?routeId={routeId}&variantKey={variantKey}`（`URLSearchParams` 組裝）。

## 2. `/practice/recall` 消費參數並自動開始

- 頁面用 App Router `useSearchParams` 讀 `routeId` / `variantKey` / 選用 `size`。
- 因 `useSearchParams` 在 App Router 需 `Suspense` 邊界（Next 16），頁面拆為：
  - `page.tsx` 預設匯出：`<Suspense fallback=…>` 包住內層元件（維持靜態預渲染）。
  - 內層 `RecallPracticeInner`：實際練習 UI + 讀參數 + 自動開始。
- 當 `routeId` + `variantKey` 皆存在且 `viewState === 'IDLE'`：
  - 預填表單狀態，並**自動開始一次** `startSession({ routeId, variantKey, sessionSize? })`。
  - `size` 有效才帶入，否則用預設。
  - 以 `useRef` flag 防重入，避免 effect 重跑重複開 session。
- **無參數**：維持原手動 IDLE 表單，行為與 Change 10 完全一致。
- 自動開始失敗（該 variant 無可練卡片 / 未報名等）：沿用 `useRecallSession` 既有錯誤/空狀態，不特別處理。

## 3. 測試（TDD，全綠）

- CTA 連結 href 帶正確 query（ReviewDashboard / VariantList）。
- mock `useSearchParams` + `useRecallSession`：帶參數 → 自動 `startSession` 一次且參數正確；
  無參數 → 不自動開始、維持手動表單。
- 既有 recall 頁測試補 `next/navigation` mock（回空參數）後仍綠。

## Non-goals
- 後端改動；練習佇列演算法、sessionSize UI 精修；帶 variant 參數的「只練該 variant」佇列語義（沿用現有 startSession 語義）。
- headsign 顯示、SRS 精熟度視覺化（後續）。
