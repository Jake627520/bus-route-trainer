# Proposal: 39-train-ferry

狀態：`proposed`
編號：39。

## Why

目前只匯入公車（route_type=3）。使用者要加 train/ferry 模式。ferry 僅 9 條、輕鬆進；train 有 707 條、可能爆 Neon 免費 1GB，故 train 取子集（用新的 maxRoutes 上限）。

## What Changes

- **匯入器**：`ImportFilter` 加 `maxRoutes`（依 routes.txt 順序取前 N 條，用於 train 子集）；trips/stop_times 的 filter guard 從 routeTypes-only 改為「有任一 filter」。
- **CLI**：`scripts/import-gtfs.ts` 加 `--max-routes=N`。
- **UI**：route-list 加模式篩選 chips（全部/公車/火車/渡輪，只在資料中存在多模式時顯示）+ 每條路線模式標籤（色彩區分：公車=品牌藍、火車=粉紅、渡輪=sky）。i18n `mode` namespace。
- **資料**：本地已灌 ferry(全) + bus/train 子集驗證；prod Neon 以同指令加 ferry + train 子集。

## Non-goals
- GTFS 自動更新（Change 40）、密碼重設（Change 41）。train 全量（容量考量）。

## 風險與測試
- 匯入器測試：routeTypes=[4] 只 ferry；maxRoutes 上限；routeTypes+maxRoutes 併用。
- route-list 測試：多模式時顯示篩選、點某模式只剩該模式。
- 守門三綠：eslint / vitest（667）/ next build。瀏覽器實測：All/Bus/Train/Ferry 篩選正確、模式標籤色彩區分。
