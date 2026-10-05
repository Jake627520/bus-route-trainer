# Proposal: 37-summary-cache

狀態：`proposed`
編號：37。

## Why

首頁上 HomeHero / ReviewReminder / BatchPracticeButton / ReviewDashboard 各自呼叫
`GET /api/review/summary`（同一支 API 抓 4 次），浪費請求與 DB 查詢。共用成一次。

## What Changes

- 新增 `ReviewSummaryProvider` + `useReviewSummary()`（Context）。Provider 抓一次 summary 並共用；
  `useReviewSummary` 在**無 Provider 時自行抓（fallback）**，確保各元件可獨立使用與獨立測試。
- 上述 4 個元件改用 `useReviewSummary()`，移除各自的 useEffect/fetch。
- 首頁 `page.tsx` 以 `<ReviewSummaryProvider>` 包住內容 → 一次 fetch 共用。
- HomeHero 仍自取 streak（本次只共用 summary）。

## Non-goals
- 跨頁快取、mutation 後自動 invalidate（首頁無 enrol 變動；導航重掛會重抓，足夠）。
- 共用 streak（StreakStat 與 HomeHero 仍各抓；可後續再做）。

## 風險與測試
- 新增 provider 測試：Provider 下 3 消費者只觸發 1 次 fetch；無 Provider 時 fallback 自取。
- 既有元件測試在隔離（無 Provider）下走 fallback，行為不變、全綠。
- 守門三綠：eslint / vitest（661）/ next build。
