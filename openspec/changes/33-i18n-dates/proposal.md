# Proposal: 33-i18n-dates

狀態：`proposed`
編號：33。

## Why

兩件與「時間」有關的在地化：
1. **相對時間在地化**：複習時間用 `formatDistanceToNow` 顯示（如 in 3 days），一律英文，zh-TW 使用者看到英文。
2. **澳洲（Brisbane）時區**：streak、精熟度趨勢、attempt 日期分組都用 `toISOString()` 的 **UTC 日界**。真實用戶是昆士蘭司機（UTC+10，無夏令時），清晨練習會被 UTC 算到前一天，streak/趨勢的「日」不準。

## What Changes

- **時區 helper**：新增 `src/application/common/app-timezone.ts`（`APP_TIME_ZONE='Australia/Brisbane'`、`toAppDateString(date)` 以 `Intl.DateTimeFormat` 轉 Brisbane 日 YYYY-MM-DD）。
- **日界改 Brisbane**：
  - `PrismaPracticeStatsAdapter.findAttemptDates`（streak 用）
  - `GetPracticeStreakUseCase` 的「今天」
  - `GetMasteryTrendUseCase` 的每日分組
- **相對時間在地化**：`src/app/_lib/date-locale.ts`（UI locale → date-fns locale：zh-TW→zhTW、en→enUS）；`ReviewDashboard` 的 `formatDistanceToNow` 帶 `locale`。

## Non-goals
- 絕對時間顯示（目前只有相對時間）；GTFS 班次時刻的時區（本就 feed 內定義）。
- 技術錯誤訊息翻譯。

## 風險與測試
- `toAppDateString` 單元測試（UTC+10 日界、午夜前後）。
- 既有 streak/trend/stats 測試中貼近 UTC 日界的 fixture 調整為明確的 Brisbane 日；streak-api 的「today」改用 `toAppDateString` 避免跨午夜 flaky。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false`（659）/ `next build`。
