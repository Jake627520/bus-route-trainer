# Specification: Practice Streak (Change 22)

練習連續天數：由 RecallAttempt.answeredAt 的練習日期算 current/longest streak，首頁 stat 顯示。不改 schema。

## 後端
- `PracticeStatsQueryPort.findAttemptDates(driverId)` → 去重 UTC 日期升冪。
- `GetPracticeStreakUseCase`（依 Clock）：currentStreak（最近練習日為今天/昨天才 active，否則 0）、longestStreak、lastPracticedOn；無資料→0/0/null。
- `GET /api/review/streak`。

## 前端
- `getPracticeStreak()`；`StreakStat`：有紀錄「🔥 連續練習 N 天／最佳 M 天」、無紀錄友善提示、載入/錯誤靜默；首頁與正確率並列。

## 測試（TDD 全綠）
adapter/use-case（今天/昨天/更早/gap/空）、API route、api-client、StreakStat、首頁整合。

## Non-goals
per-variant streak；時區在地化；提醒推播；schema 變更。
