# Spec: gtfs-import（Change 39 maxRoutes）

## ADDED Requirements

### Requirement: 路線數上限過濾
系統 SHALL 支援 `maxRoutes`：依 routes.txt 順序最多保留 N 條路線，並串聯只保留其 trips/stop_times，用於匯入大型模式（如 train）的子集以控制容量。

#### Scenario: 取子集
- **WHEN** 以 `maxRoutes=N` 匯入
- **THEN** 最多保留 N 條路線及其 trips/stop_times；可與 routeTypes 併用（先依類型過濾再取前 N）
