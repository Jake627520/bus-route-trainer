# Tasks: 22-practice-streak

> TDD（先紅後綠）。前端 mock fetch、後端整合測試打真 DB（afterAll 自清）。
> 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 22.1: 後端
- [x] Task 1: 寫失敗測試（真 DB）：adapter `findAttemptDates(driverId)` → 去重 UTC 日期升冪（跨 session、排除他 driver）<!-- id: 22-01 -->
- [x] Task 2: port 加 findAttemptDates；Prisma adapter until PASS <!-- id: 22-02 -->
- [x] Task 3: 寫失敗測試（fake port + fixedClock）：`GetPracticeStreakUseCase` 算 currentStreak（今天/昨天 active、更早→0）、longestStreak、lastPracticedOn、無資料→0/0/null；實作 until PASS <!-- id: 22-03 -->
- [x] Task 4: 寫失敗測試 + 實作 `GET /api/review/streak`（整合測試 afterAll 自清）until PASS <!-- id: 22-04 -->

## Phase 22.2: 前端
- [x] Task 5: api-client `getPracticeStreak()` + 型別；契約測試 <!-- id: 22-05 -->
- [x] Task 6: 寫失敗測試：`StreakStat`——有練習顯示連續/最佳天數、無練習友善提示、載入/錯誤靜默；實作 until PASS <!-- id: 22-06 -->
- [ ] Task 7: 寫失敗測試 + 把 StreakStat 掛進首頁 until PASS；既有首頁測試仍綠 <!-- id: 22-07 -->

## Phase 22.3: 守門與收尾
- [ ] Task 8: 全套守門（lint + test + build 全綠）<!-- id: 22-08 -->
- [ ] Task 9: 建 `specs/` spec；`openspec archive 22-practice-streak`；開 PR <!-- id: 22-09 -->

## 注意
- streak 為純邏輯（fake port + 固定 clock 測試）；UTC 分日（answeredAt.toISOString().slice(0,10)）。
- currentStreak active 判定：最近練習日 === 今天 或 昨天。
- 增益：前端載入/錯誤靜默。後端整合測試 afterAll 自清。首頁測試 mock 加 /api/review/streak。
