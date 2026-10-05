# Proposal: 36-skeletons-hero

狀態：`proposed`
編號：36。承接視覺打磨（34/35）。

## Why

兩項體驗提升：(1) 載入狀態只有「載入中…」純文字，版面會跳動、等待感強；(2) 首頁缺少視覺焦點。依 web-layout 原則「深色區塊當強調」，加一塊深色漸層 feature 錨點。

## What Changes

- **載入骨架**：新增 `Skeleton` / `SkeletonList` UI 原語（shimmer，`role="status"`，reduced-motion 由 globals 關動畫）。套到 review-dashboard / route-list / variant-list 的 loading 狀態，取代純文字。
- **首頁 feature 錨點**：新增 `HomeHero`（client）——Translink 深藍漸層卡 + 右上粉紅光暈，彙總今日待複習數與連續天數（粉紅 🔥），到期時提供「立即複習」deep-link CTA（pink-700，白字 AA）。掛在首頁標題下方。
- `messages.ts` 新增 `hero` namespace（en/zh-TW）。

## Non-goals
- 共用 review summary 快取（多元件重複 fetch 的效能優化，另議）。

## 風險與測試
- 載入骨架保留 `role="status"`，既有兩個 loading-indicator 測試（查 role=status）仍綠。
- HomeHero 取 summary+streak，home-page 測試已 mock 該二 URL，不受影響。
- 純增益/樣式；守門三綠：eslint / vitest（659）/ next build。
- 瀏覽器實測：首頁深藍漸層錨點 + 粉紅光暈；載入時骨架占位。
