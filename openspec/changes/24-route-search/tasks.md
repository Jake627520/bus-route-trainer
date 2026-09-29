# Tasks: 24-route-search

> TDD（先紅後綠）。前端 mock fetch。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 24.1: 搜尋過濾
- [x] Task 1: 寫失敗測試：載入後顯示搜尋框；輸入關鍵字即時過濾（比對 shortName / longName、不分大小寫）；清空還原全部 <!-- id: 24-01 -->
- [x] Task 2: 寫失敗測試：過濾無結果 → 顯示「找不到符合的路線」、搜尋框仍在 <!-- id: 24-02 -->
- [x] Task 3: 實作 RouteList 搜尋框 + 過濾 until PASS；既有 RouteList 測試（四態）無回歸 <!-- id: 24-03 -->

## Phase 24.2: 守門與收尾
- [ ] Task 4: 全套守門（lint + test + build 全綠）<!-- id: 24-04 -->
- [ ] Task 5: 建 `specs/` spec；`openspec archive 24-route-search`；開 PR <!-- id: 24-05 -->

## 注意
- 客戶端過濾（已取得的 routes）；不新增 API。
- 搜尋框只在有路線時顯示；無路線維持既有空狀態；載入/錯誤不變。
- 過濾用 fireEvent.change 輸入；比對不分大小寫、trim。
