# Tasks: 13-practice-deep-link

> 從第一個未勾 task 開始，照 TDD（先紅後綠），每步跑 `npm test`（前端 mock fetch/hook、不需 DB）。
> 完成一個就勾起來並 commit。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 13.1: CTA 帶參數
- [x] Task 1: 寫失敗測試：ReviewDashboard「開始練習」href = `/practice/recall?routeId=..&variantKey=..` <!-- id: 13-01 -->
- [x] Task 2: 寫失敗測試：VariantList 已報名列「開始練習」href 帶正確 routeId+variantKey <!-- id: 13-02 -->
- [x] Task 3: 實作兩處連結帶 query（`URLSearchParams` 組裝）until PASS <!-- id: 13-03 -->

## Phase 13.2: /practice/recall 消費參數
- [x] Task 4: 讀 Next 16 `use-search-params` 文件；將 page 拆為 `<Suspense>` wrapper + 內層練習元件 <!-- id: 13-04 -->
- [x] Task 5: 寫失敗測試（mock `useSearchParams`）：帶 routeId+variantKey → 自動呼叫 `startSession` 一次且參數正確 <!-- id: 13-05 -->
- [x] Task 6: 寫失敗測試：無參數 → 不自動開始、維持手動 IDLE 表單 <!-- id: 13-06 -->
- [x] Task 7: 實作消費參數 + 自動開始（ref 防重入）until PASS；既有 recall 頁測試仍綠 <!-- id: 13-07 -->

## Phase 13.3: 守門與收尾
- [x] Task 8: 全套守門（`npm run lint` + `npm test` + `npm run build` 全綠）<!-- id: 13-08 -->
- [x] Task 9: 建 `specs/` spec；`openspec archive 13-practice-deep-link`；開 PR <!-- id: 13-09 -->

## 注意
- 純前端；重用 `useRecallSession.startSession`，不動後端。
- `useSearchParams` 在 App Router 需 `Suspense` 邊界（Next 16）——先讀官方文件再寫。
- 自動開始須防重入（ref/flag），避免 effect 重跑重複開 session。
- 無參數時行為與現狀完全一致（fallback 手動表單）。
