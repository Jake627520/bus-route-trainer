# Tasks: 28-gtfs-bus-import

> TDD。守門三綠：`eslint` / `vitest run --fileParallelism=false`（不破壞既有 637）/ `next build`。

## Phase 28.1: route-type 過濾（TDD）
- [x] Task 1: `mixed-modes-feed` fixture + `ImportGtfsUseCase` filter（routeTypes 串聯過濾 routes→trips→stop_times，兩段一致；無 filter 向下相容）測試 + 實作 <!-- id: 28-01 -->
- [x] Task 2: `scripts/import-gtfs.ts` 加 `--bus-only` / `--route-types=` 旗標 <!-- id: 28-02 -->

## Phase 28.2: 實際灌本地 DB
- [x] Task 3: 以 `--bus-only` 匯入 SEQ feed 公車線到本地 Postgres，記錄匯入統計 <!-- id: 28-03 -->

## Phase 28.3: 守門與收尾
- [x] Task 4: 全套守門（lint + test + build 全綠；不破壞既有 637）<!-- id: 28-04 -->
- [x] Task 5: 建 spec；archive；開 PR、CI 綠 auto-merge <!-- id: 28-05 -->

## 注意
- stops/calendars 全留（過濾只作用於 routes/trips/stop_times，維持參照完整性）。
- 自動更新暫緩；prod 匯入由使用者依 DEPLOY.md 執行同一指令。
