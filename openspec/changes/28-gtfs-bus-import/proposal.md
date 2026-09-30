# Proposal: 28-gtfs-bus-import

狀態：`proposed`
編號：28。

## Why

認證與部署設定就緒，但資料庫沒有真實路線資料，首頁「所有路線」是空的。使用者已下載 SEQ GTFS feed 到 `~/Downloads/seq_gtfs`（已驗證有效：742 條公車線、stop_times 約 3.85M，含 train/ferry）。全量太大且含非公車模式；使用者決定：**只匯入全部公車線（route_type=3）**、排除 train(2)/ferry(4)、自動更新暫緩。

## What Changes

- **`ImportGtfsUseCase` 加 route-type 過濾**：`execute(dir, options, filter?: { routeTypes })`。給定 routeTypes 時，只匯入這些 route_type 的 routes，並串聯過濾其 trips 與 stop_times（keptRouteIds→keptTripIds）；stops/calendars 全留（參照安全）。兩段（驗證 + 持久化）一致套用。未給 filter＝匯入全部（向下相容）。
- **CLI 旗標**：`scripts/import-gtfs.ts` 加 `--bus-only`（＝`--route-types=3`）與 `--route-types=a,b`。
- **實際灌本地 DB**：以 `--bus-only` 把 SEQ feed 公車線灌進本地 Postgres，讓本地 dev 首頁可見路線。

## Non-goals
- 自動更新／排程（暫緩）。
- 部署到 prod DB 的匯入（依 DEPLOY.md 由使用者在 prod 執行同一指令）。
- train/ferry 模式（本 change 只做公車）。

## 風險與測試（TDD）
- 新增 `mixed-modes-feed` fixture（bus/ferry/train 各一）：`routeTypes=[3]` 只留 bus route+trip+stop_times；無 filter 匯入全部（向下相容）。既有匯入測試不受影響。
- 參照完整性：過濾後 `validator.finalize()` 仍通過（kept trips 只指向 kept routes、kept stop_times 只指向 kept trips，stops/services 全留）。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false`（不破壞既有 637）/ `next build`。
