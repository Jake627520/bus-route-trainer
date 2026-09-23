# Tasks: 17-mastery-trend

> 從第一個未勾 task 開始，照 TDD（先紅後綠），每步跑 `npm test`。
> 前端 mock fetch、後端整合測試打真 DB（afterAll 自清）。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 17.1: 事件查詢 port + adapter
- [x] Task 1: 寫失敗測試（真 DB，afterAll 自清）：`MasteryHistoryQueryPort` adapter——依 session.driverId 撈 attempt 的 cardKey/resultingState/answeredAt，依 answeredAt 升冪 <!-- id: 17-01 -->
- [x] Task 2: 定義 port + Prisma adapter until PASS <!-- id: 17-02 -->

## Phase 17.2: 重放 use-case
- [x] Task 3: 寫失敗測試（純邏輯 fake port）：`GetMasteryTrendUseCase` 重放——每日快照 masteredCount、lapse 回落、同日多筆、無 attempt→[] <!-- id: 17-03 -->
- [x] Task 4: 實作重放（Map<cardKey,state>、UTC 日分桶、逐日快照）until PASS <!-- id: 17-04 -->

## Phase 17.3: API 端點
- [x] Task 5: 寫失敗測試 + 實作 `GET /api/review/mastery-trend`（DI 組裝 adapter；整合測試 afterAll 自清）until PASS <!-- id: 17-05 -->

## Phase 17.4: 前端圖表 + 首頁
- [ ] Task 6: api-client 加 `MasteryTrendPoint` + `getMasteryTrend()`；契約測試 <!-- id: 17-06 -->
- [ ] Task 7: 寫失敗測試：`MasteryTrend` 元件——有資料渲染 SVG（點數、aria-label）、空資料友善提示、載入/錯誤靜默 <!-- id: 17-07 -->
- [ ] Task 8: 實作 `MasteryTrend`（手刻 inline SVG polyline/area）until PASS <!-- id: 17-08 -->
- [ ] Task 9: 寫失敗測試 + 把「精熟度趨勢」section 掛進首頁（待複習之下）until PASS；既有首頁測試仍綠 <!-- id: 17-09 -->

## Phase 17.5: 守門與收尾
- [ ] Task 10: 全套守門（`npm run lint` + `npm test` + `npm run build` 全綠）<!-- id: 17-10 -->
- [ ] Task 11: 建 `specs/` spec；`openspec archive 17-mastery-trend`；開 PR <!-- id: 17-11 -->

## 注意
- 重放 use-case 為純邏輯，fake port 注入事件、免 DB；adapter 用真 DB 整合測試。
- SVG 圖表手刻、不加依賴；資料點加 data-testid、role="img"+aria-label 供測試與 a11y。
- 趨勢為增益：載入/錯誤靜默，不阻塞首頁；無 attempt 顯示友善空狀態。
- 日期分桶 UTC（`answeredAt.toISOString().slice(0,10)`）。
