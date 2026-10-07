# Proposal: 38-streak-cache

狀態：`proposed`
編號：38。延續 Change 37（共用 summary）的 pattern，共用 streak。

## Why

首頁 HomeHero 與 StreakStat 各自抓 `GET /api/review/streak`（2 次）。共用成一次。

## What Changes

- 新增 `PracticeStreakProvider` + `useStreak()`（與 Change 37 同一 pattern：Provider 抓一次共用；
  無 Provider 時 fallback 自取，確保獨立使用/測試）。
- HomeHero、StreakStat 改用 `useStreak()`，移除各自 fetch。
- 首頁 `page.tsx` 以 `<PracticeStreakProvider>`（巢狀於 ReviewSummaryProvider）包住內容。

## Non-goals
- 跨頁快取、mutation invalidate（導航重掛重抓足夠）。

## 風險與測試
- 新增 provider 測試：Provider 下 2 消費者只 1 次 fetch；無 Provider fallback。
- 既有 streak-stat 測試隔離（無 Provider）走 fallback，不變。
- 守門三綠：eslint / vitest（663）/ next build。
