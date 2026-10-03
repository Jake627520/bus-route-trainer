# Tasks: 31-i18n-components

> 回歸為主（既有測試包 LocaleProvider zh-TW）。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 31.1: messages 擴充
- [x] Task 1: `messages.ts` 補齊各元件 key（en + zh-TW） <!-- id: 31-01 -->

## Phase 31.2: 元件雙語化
- [x] Task 2: streak-stat、accuracy-stat、batch-practice-button 改 useT()；測試包 Provider <!-- id: 31-02 -->
- [x] Task 3: mastery-trend、review-notifier、review-reminder 改 useT()；測試包 Provider <!-- id: 31-03 -->
- [x] Task 4: review-dashboard、variant-list（含方向/狀態標籤）改 useT()；測試包 Provider <!-- id: 31-04 -->
- [x] Task 5: route-list 改 useT()；routes/[routeId] 頁用 <T>；recall 頁 4 個中文轉 t()；測試包 Provider <!-- id: 31-05 -->

## Phase 31.3: 守門與收尾
- [x] Task 6: 全套守門（lint + test + build 全綠）<!-- id: 31-06 -->
- [x] Task 7: 建 spec；archive；開 PR（rebase 到含 Change 30 的 main）、CI 綠 auto-merge；瀏覽器驗證 <!-- id: 31-07 -->

## 注意
- recall 頁現有英文 UI 不在本 change 翻譯（留 recall 專屬 change）。
- formatDistanceToNow 維持英文（日期在地化之後再做）。
