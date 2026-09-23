# Tasks: 07-route-browsing-ui

> 接手者（含 Antigravity）：從第一個未勾的 task 開始，照 TDD（先紅後綠），每步在容器內 `docker compose run --rm app npm test`。完成一個就勾起來並 commit。

## TDD Implementation Sequence
- [x] Task 1: 寫失敗測試 `api-client.test.ts`：解析 `{ data }` 成功與 `{ error }` 失敗兩種形狀 <!-- id: 07-01 -->
- [x] Task 2: 實作 `src/app/_lib/api-client.ts`（薄 fetch 封裝）until PASS <!-- id: 07-02 -->
- [x] Task 3: 寫失敗測試：路線列表元件——載入中、成功渲染 shortName/longName、空清單 <!-- id: 07-03 -->
- [x] Task 4: 實作路線列表元件 + `src/app/page.tsx`（取代預設樣板）until PASS <!-- id: 07-04 -->
- [x] Task 5: 寫失敗測試：路線列表 API 錯誤時顯示錯誤訊息 <!-- id: 07-05 -->
- [x] Task 6: 實作錯誤狀態 until PASS <!-- id: 07-06 -->
- [x] Task 7: 寫失敗測試：variant 列表元件（渲染 variants、顯示各自進度狀態） <!-- id: 07-07 -->
- [x] Task 8: 實作 variant 列表 + `src/app/routes/[routeId]/page.tsx` until PASS <!-- id: 07-08 -->
- [x] Task 9: 寫失敗測試：點 Enroll → 呼叫 POST /api/progress/enroll → 畫面更新為已報名/進度 <!-- id: 07-09 -->
- [x] Task 10: 實作 Enroll 互動 until PASS <!-- id: 07-10 -->
- [ ] Task 11: 全套守門（容器內）：`npm run lint` + `npm test` + `npm run build` 全綠 <!-- id: 07-11 -->
- [ ] Task 12: 更新 `openspec/specs/` 建 `route-browsing-ui` spec；archive 本 change；開 PR <!-- id: 07-12 -->

## 注意
- 前端測試 **mock fetch**，不打真 DB（快、與後端整合測試分離）。
- Next 16 破壞性變更：動手前讀 `node_modules/next/dist/docs/`（見 AGENTS.md）。
- 資料一律走現有 HTTP API，前端不直接 import Prisma / use-case。
