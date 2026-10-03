# Proposal: 31-i18n-components

狀態：`proposed`
編號：31。依賴 Change 30（i18n 基建）。

## Why

Change 30 做了 i18n 基建 + 登入頁 + 首頁 shell。首頁子元件與路線相關頁面仍硬編繁中，英語司機看不懂。本 change 把剩餘「原本繁中」的元件補成雙語（en/zh-TW），消除英語模式下的中文殘留。

## 範圍盤點

- **原本繁中、需雙語化**：route-list、review-notifier、streak-stat、accuracy-stat、batch-practice-button、mastery-trend、review-reminder、review-dashboard、variant-list、routes/[routeId] 頁。
- **recall 練習頁（`/practice/recall`）其實大部分已是英文**（Bus Route Recall Trainer / Abandon / Start Practice Session…），僅 4 個中文（批次練習 / 全部完成 / 下一條路線 / 載入中）→ 本 change 把這 4 個轉 t()，其英文 UI 維持現狀（主要受眾是英語司機）。該頁 full 雙語（把現有英文也翻成 zh-TW）留 recall 專屬 change。

## What Changes

- `messages.ts` 擴充各元件 key（en + zh-TW）。
- 上述元件改用 `useT()`（client 元件）顯示字串；方向/狀態標籤改用 t()。
- 路線詳情頁（server 元件）用 `<T>`。
- recall 頁 4 個中文轉 t()。
- 既有元件測試改包 `<LocaleProvider locale="zh-TW">` 保留中文斷言。

## Non-goals
- recall 練習頁現有英文 UI 的 zh-TW 翻譯（留 recall 專屬 change）。
- 日期相對時間在地化（`formatDistanceToNow` 維持英文；之後再接 date-fns locale）。

## 風險與測試（TDD/回歸）
- 每個元件既有測試斷言中文 → render 包 `LocaleProvider locale="zh-TW"`，文案不變即綠。
- 新增少量「切 en 顯示英文」斷言於代表性元件（streak-stat / review-dashboard）。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。
