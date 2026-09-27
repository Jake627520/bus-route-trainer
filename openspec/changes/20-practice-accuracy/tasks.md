# Tasks: 20-practice-accuracy

> TDD（先紅後綠），每步跑 `npm test`。前端 mock fetch、後端整合測試打真 DB（afterAll 自清）。
> 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 20.1: 後端統計 port + use-case
- [x] Task 1: 寫失敗測試（真 DB）：adapter `countOutcomesByDriver(driverId)` → { total, passed }（seed PASS/FAIL、他 driver 排除）<!-- id: 20-01 -->
- [x] Task 2: 定義 port + Prisma adapter until PASS <!-- id: 20-02 -->
- [x] Task 3: 寫失敗測試（fake port）：`GetPracticeAccuracyUseCase` 算 accuracy（一般/全對/零題→accuracy 0）；實作 until PASS <!-- id: 20-03 -->

## Phase 20.2: API 端點
- [ ] Task 4: 寫失敗測試 + 實作 `GET /api/review/accuracy`（整合測試 afterAll 自清）until PASS <!-- id: 20-04 -->

## Phase 20.3: 前端
- [ ] Task 5: api-client `getPracticeAccuracy()` + 型別；契約測試 <!-- id: 20-05 -->
- [ ] Task 6: 寫失敗測試：`AccuracyStat`——有紀錄顯示正確率%+答對/總題、零紀錄友善提示、載入/錯誤靜默；實作 until PASS <!-- id: 20-06 -->
- [ ] Task 7: 寫失敗測試 + 把 AccuracyStat 掛進首頁 until PASS；既有首頁測試仍綠 <!-- id: 20-07 -->

## Phase 20.4: 守門與收尾
- [ ] Task 8: 全套守門（lint + test + build 全綠）<!-- id: 20-08 -->
- [ ] Task 9: 建 `specs/` spec；`openspec archive 20-practice-accuracy`；開 PR <!-- id: 20-09 -->

## 注意
- accuracy = passed/total（total 0 → 0）；前端顯示 round(accuracy*100)%。
- 純統計、增益：前端載入/錯誤靜默。後端整合測試 afterAll 自清。
- 首頁整合測試 mock fetch 依 URL 分派（含 /api/review/accuracy）。
