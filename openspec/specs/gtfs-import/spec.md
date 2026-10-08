# gtfs-import Specification

## Purpose
TBD - created by archiving change 28-gtfs-bus-import. Update Purpose after archive.

## Requirements

### Requirement: route-type 過濾匯入
系統 SHALL 支援依 `route_type` 過濾匯入：給定 `routeTypes` 時只匯入這些類型的路線，並串聯過濾其 trips 與 stop_times，維持參照完整性。

#### Scenario: 只匯入公車線
- **WHEN** 以 `routeTypes=[3]` 匯入含 bus/ferry/train 的 feed
- **THEN** 只持久化 route_type=3 的 routes、其 trips、其 stop_times；ferry/train 的 routes/trips/stop_times 不匯入

#### Scenario: 參照完整性維持
- **WHEN** 過濾後執行跨檔驗證
- **THEN** 保留的 trips 只指向保留的 routes、保留的 stop_times 只指向保留的 trips；stops 與 calendars 全數保留，驗證通過

#### Scenario: 未給過濾條件維持向下相容
- **WHEN** 未提供 `routeTypes`
- **THEN** 匯入 feed 中所有路線（與過去行為一致）

### Requirement: 匯入 CLI 過濾旗標
系統 SHALL 讓 `scripts/import-gtfs.ts` 支援 `--bus-only`（＝`--route-types=3`）與 `--route-types=a,b`。

#### Scenario: bus-only 匯入
- **WHEN** 執行 `npx tsx scripts/import-gtfs.ts <feed> --bus-only`
- **THEN** 只匯入公車線（route_type=3）

### Requirement: 路線數上限過濾
系統 SHALL 支援 `maxRoutes`：依 routes.txt 順序最多保留 N 條路線，並串聯只保留其 trips/stop_times，用於匯入大型模式（如 train）的子集以控制容量。

#### Scenario: 取子集
- **WHEN** 以 `maxRoutes=N` 匯入
- **THEN** 最多保留 N 條路線及其 trips/stop_times；可與 routeTypes 併用（先依類型過濾再取前 N）
