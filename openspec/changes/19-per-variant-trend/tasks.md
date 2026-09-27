# Tasks: 19-per-variant-trend

> 從第一個未勾 task 開始，照 TDD（先紅後綠），每步跑 `npm test`。
> 前端 mock fetch、後端整合測試打真 DB（afterAll 自清）。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 19.1: 後端 variantKey 過濾
- [x] Task 1: 寫失敗測試（真 DB）：adapter `findMasteryEventsByDriver(driverId, variantKey)` 只回該 variant 的事件（跨 variant seed）<!-- id: 19-01 -->
- [x] Task 2: port 加選用 variantKey；adapter where 條件式加 targetVariantKey until PASS <!-- id: 19-02 -->
- [x] Task 3: 寫失敗測試（fake port）：`GetMasteryTrendUseCase` command 帶 variantKey → 透傳給 port；實作 until PASS <!-- id: 19-03 -->

## Phase 19.2: API 端點
- [x] Task 4: 寫失敗測試 + 實作 `GET /api/review/mastery-trend?variantKey=`（過濾；無則整體）（整合測試 afterAll 自清）until PASS <!-- id: 19-04 -->

## Phase 19.3: 前端
- [x] Task 5: api-client `getMasteryTrend(variantKey?)` 附 query；契約測試 <!-- id: 19-05 -->
- [x] Task 6: `MasteryTrend` 加選用 `variantKey` prop（有則抓該 variant）；測試涵蓋，且無 prop 行為不變 <!-- id: 19-06 -->
- [ ] Task 7: 寫失敗測試：VariantList 已報名列渲染 `<MasteryTrend variantKey>`、未報名不渲染；實作 until PASS；既有 VariantList 測試無回歸 <!-- id: 19-07 -->

## Phase 19.4: 守門與收尾
- [ ] Task 8: 全套守門（`npm run lint` + `npm test` + `npm run build` 全綠）<!-- id: 19-08 -->
- [ ] Task 9: 建 `specs/` spec；`openspec archive 19-per-variant-trend`；開 PR <!-- id: 19-09 -->

## 注意
- variantKey 為選用參數，全鏈路向下相容（Change 17 整體趨勢不變）。
- 重用 Change 17 的重放 use-case 與手刻 SVG；只縮小事件範圍。
- VariantList 已報名判斷沿用 Change 12 的 enrolledStatus；每列趨勢載入/錯誤靜默。
- 前端測試 mock fetch by URL（含 ?variantKey）；後端整合測試 afterAll 自清。
