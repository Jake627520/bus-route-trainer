# Proposal: 22-practice-streak

狀態：`proposed`（使用者已授權連續開發，決策直接鎖定）
編號：22。

## Why

「連續練習天數」是最有效的習慣激勵指標。`RecallAttempt.answeredAt` 已記每次練習時間，
可算出司機的**目前連續天數**與**最佳紀錄**，鼓勵每天回來練。不改 schema。

## What Changes

### 1. 後端：練習日期 → streak
- `PracticeStatsQueryPort.findAttemptDates(driverId)` → 該 driver 有練習的 UTC 日期（去重、升冪）。
- Prisma adapter：撈 attempt 的 answeredAt（經 session.driverId），映成 UTC 日期字串去重。
- `GetPracticeStreakUseCase`（依 `Clock`）：
  - `currentStreak`：以「今天(UTC)」為基準，從最近練習日往回數連續天數；
    最近練習日須為**今天或昨天**才算 active，否則 `currentStreak = 0`（已中斷）。
  - `longestStreak`：日期集合中最長連續天數。
  - `lastPracticedOn`：最近練習日（YYYY-MM-DD）或 null。
- `GET /api/review/streak` → `{ data: { currentStreak, longestStreak, lastPracticedOn } }`。

### 2. 前端：streak stat
- `api-client.getPracticeStreak()` + 型別。
- `StreakStat` 元件：有練習 → 「🔥 連續練習 {currentStreak} 天」＋「最佳 {longestStreak} 天」；
  無練習（longestStreak=0）→ 友善提示「開始每天練習，累積連續天數」；載入中/錯誤 → 靜默。
- 首頁：正確率 stat 附近顯示。

## 決策（鎖定）
1. ✅ currentStreak 只在最近練習日為今天或昨天時為 active，否則歸 0。
2. ✅ 一併給 longestStreak 與 lastPracticedOn。
3. ✅ 位置＝首頁（正確率 stat 附近）。UTC 分日。

## Non-goals
- per-variant streak；時區在地化；提醒推播；schema 變更。

## 影響
- 修改：`practice-stats-query-port.ts`、`prisma-practice-stats-adapter.ts`（加 findAttemptDates）；
  新增：`GetPracticeStreakUseCase`、`GET /api/review/streak`、`StreakStat`、api-client 方法，及測試。
- 修改：`src/app/page.tsx`、首頁整合測試。
- 完成後於 `specs/` 建 spec 並 archive。
