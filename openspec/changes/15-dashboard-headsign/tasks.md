# Tasks: 15-dashboard-headsign

> 從第一個未勾 task 開始，照 TDD（先紅後綠），每步跑 `npm test`。
> 前端 mock fetch、後端整合測試打真 DB（afterAll 自清）。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 15.1: headsign 查詢 port + adapter
- [ ] Task 1: 寫失敗測試：`VariantHeadsignQueryPort` adapter——包 GetRouteVariantsUseCase，映 (variantKey→headsign)，route 不存在→[] <!-- id: 15-01 -->
- [ ] Task 2: 定義 port + 實作 adapter until PASS <!-- id: 15-02 -->

## Phase 15.2: use-case 補 headsign
- [ ] Task 3: 寫失敗測試：`GetReviewSummaryUseCase` 按 routeId 分組查 headsign、補到每筆；查不到→null；某 route 查詢丟錯→該列 null 且不中斷其他列 <!-- id: 15-03 -->
- [ ] Task 4: DTO 加 headsign；use-case 接 port、分組查詢、補值 until PASS <!-- id: 15-04 -->

## Phase 15.3: API 接線 + 前端
- [ ] Task 5: route.ts 接 headsign port（用 PrismaGtfsReadRepository + GetRouteVariantsUseCase 組裝 adapter）；整合測試確認回應含 headsign（afterAll 自清）until PASS <!-- id: 15-05 -->
- [ ] Task 6: api-client `VariantReviewSummary` 加 headsign；更新既有 review-api-client 測試 <!-- id: 15-06 -->
- [ ] Task 7: 寫失敗測試：ReviewDashboard 顯示 headsign（含 null→未標示終點）；實作 until PASS；既有 dashboard 測試補 headsign 欄位仍綠 <!-- id: 15-07 -->

## Phase 15.4: 守門與收尾
- [ ] Task 8: 全套守門（`npm run lint` + `npm test` + `npm run build` 全綠）<!-- id: 15-08 -->
- [ ] Task 9: 建 `specs/` spec；`openspec archive 15-dashboard-headsign`；開 PR <!-- id: 15-09 -->

## 注意
- headsign 為增益：route 查詢失敗一律降級為 null，不得中斷 summary。
- 按 routeId 分組，每 distinct route 只查一次（避免重複 GTFS 查詢）。
- 既有測試的 summary mock/seed 要補 headsign 欄位。
- 前端測試 mock fetch、不打 DB；後端整合測試 afterAll 自清。
