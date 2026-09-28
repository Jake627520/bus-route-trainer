# Tasks: 21-per-variant-accuracy

> TDD（先紅後綠）。前端 mock fetch、後端整合測試打真 DB（afterAll 自清）。
> 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 21.1: 後端 variantKey 過濾
- [x] Task 1: 寫失敗測試（真 DB）：adapter `countOutcomesByDriver(driverId, variantKey)` 只計該 variant（跨 variant seed）<!-- id: 21-01 -->
- [x] Task 2: port 加選用 variantKey；adapter where 條件式加 targetVariantKey；use-case command 加 variantKey 透傳 until PASS <!-- id: 21-02 -->
- [x] Task 3: 寫失敗測試 + 實作 `GET /api/review/accuracy?variantKey=`（整合測試 afterAll 自清）until PASS <!-- id: 21-03 -->

## Phase 21.2: 前端
- [ ] Task 4: api-client `getPracticeAccuracy(variantKey?)` 附 query；契約測試 <!-- id: 21-04 -->
- [ ] Task 5: `AccuracyStat` 加選用 `variantKey` prop（有→compact 內嵌、抓該 variant；無→大卡不變）；測試涵蓋 <!-- id: 21-05 -->
- [ ] Task 6: 寫失敗測試：VariantList 已報名列顯示該 variant compact 正確率（帶 variantKey）；實作 until PASS；既有 variant 測試無回歸 <!-- id: 21-06 -->

## Phase 21.3: 守門與收尾
- [ ] Task 7: 全套守門（lint + test + build 全綠）<!-- id: 21-07 -->
- [ ] Task 8: 建 `specs/` spec；`openspec archive 21-per-variant-accuracy`；開 PR <!-- id: 21-08 -->

## 注意
- variantKey 為選用，全鏈路向下相容（Change 20 整體正確率不變）。
- AccuracyStat compact 模式與大卡共用資料抓取，只差呈現。
- VariantList 已報名判斷沿用 enrolledStatus；per-variant 正確率載入/錯誤靜默。
- 既有 variant/首頁測試的 mock 需處理 /api/review/accuracy?variantKey=。
