# Tasks: 11-review-dashboard

> 接手者（含 Antigravity）：從第一個未勾 task 開始，照 TDD（先紅後綠），
> 每步跑 `npm test`（前端測試 mock fetch 不需 DB；後端 use-case/route 測試依既有模式）。
> 完成一個就勾起來並 commit。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 11.1: 後端複習彙總 use-case
- [x] Task 1: 寫失敗測試：`GetReviewSummaryUseCase`——對每個 enrolled variant 計算 dueCount / newCount / nextReviewAt（含全到期、無卡、空 enrolled 邊界）<!-- id: 11-01 -->
- [x] Task 2: 若缺「列舉某 driver 全部 enrolled progress」查詢，於 learning-progress port + Prisma adapter 補方法（先寫測試）until PASS <!-- id: 11-02 -->
- [x] Task 3: 實作 `GetReviewSummaryUseCase`（組合 due/new/progress port + `isCardDue`）until PASS <!-- id: 11-03 -->

## Phase 11.2: HTTP API
- [x] Task 4: 寫失敗測試：`GET /api/review/summary`——`{ data: VariantReviewSummary[] }` 成功、錯誤信封映射、driver 用 DEFAULT_DRIVER_ID <!-- id: 11-04 -->
- [x] Task 5: 實作 `src/app/api/review/summary/route.ts`（組裝 use-case + DI）until PASS <!-- id: 11-05 -->

## Phase 11.3: 前端 api-client + 儀表板
- [x] Task 6: 寫失敗測試：`api-client.getReviewSummary()` 解析 {data}/{error} <!-- id: 11-06 -->
- [x] Task 7: 實作 `getReviewSummary()` until PASS <!-- id: 11-07 -->
- [x] Task 8: 寫失敗測試：`ReviewDashboard` 元件——載入中/成功（渲染 dueCount 徽章、下次複習時間、開始複習 CTA href=/practice/recall）/空/錯誤，且依 dueCount 由多到少排序、dueCount=0 淡化 <!-- id: 11-08 -->
- [x] Task 9: 實作 `ReviewDashboard` until PASS <!-- id: 11-09 -->
- [x] Task 10: 把「待複習」區塊掛進首頁 `/`（或獨立 `/review`，依提案開放問題定案）；補整合測試 until PASS <!-- id: 11-10 -->

## Phase 11.4: 守門與收尾
- [ ] Task 11: 全套守門（`npm run lint` + `npm test` + `npm run build` 全綠）<!-- id: 11-11 -->
- [ ] Task 12: 建 `openspec/changes/11-review-dashboard/specs/` spec；`openspec archive 11-review-dashboard`；開 PR <!-- id: 11-12 -->

## 注意
- 前端測試 mock fetch、不打真 DB；資料一律走新 `/api/review/summary`，前端不直接 import Prisma。
- Next 16 破壞性變更：動手前讀 `node_modules/next/dist/docs/`（見 AGENTS.md）。
- 相對時間可用既有相依 `date-fns`。
- Zero-auth：driver 用 `DEFAULT_DRIVER_ID`，client 不送 driverId。
