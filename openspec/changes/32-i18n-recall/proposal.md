# Proposal: 32-i18n-recall

狀態：`proposed`
編號：32。依賴 Change 30/31（i18n 基建 + 元件）。

## Why

Change 31 把儀表板元件雙語化，但 recall 練習頁（`/practice/recall`）原本大多硬編英文（Bus Route Recall Trainer / Start Practice Session / Abandon…），zh-TW 使用者在練習畫面仍看到英文。本 change 把該頁所有使用者可見字串改 i18n，達成真正 100% 全站雙語。

## What Changes

- `messages.ts` 的 `recall` namespace 擴充約 35 個 key（en + zh-TW）：標題/副標、開始表單 label/placeholder/按鈕、載入、無卡片、作答（模式標籤、提示、輸入框、送出）、送出失敗、回饋（正確/錯誤、卡片狀態/SRS 等級、下一題）、完成、放棄、錯誤、放棄確認 Modal、emoji aria-label。
- recall 頁字串全部改 `t()`（`RecallPracticeInner` 已有 `useT`）。
- `Card State:` / `SRS Level:` 因含 `<strong>` 內嵌，拆成 label key 保留結構。

## Non-goals
- 技術錯誤碼/訊息（error.code / error.message）翻譯。
- `formatDistanceToNow` 日期在地化（之後接 date-fns locale）。

## 風險與測試（回歸）
- 既有 recall 測試：practice-batch（Change 31 已包 renderZh zh-TW）斷言批次中文仍相符；practice-deep-link（預設 en）斷言為行為/英文，不受影響。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false`（657）/ `next build`。
- 瀏覽器實測：recall 頁 en↔zh-TW 雙向切換正確。
