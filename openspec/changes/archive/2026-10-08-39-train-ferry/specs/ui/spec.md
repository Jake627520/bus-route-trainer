# Spec: ui（Change 39 模式篩選）

## ADDED Requirements

### Requirement: 路線模式篩選與標示
系統 SHALL 在路線列表以模式（公車/火車/渡輪）標示每條路線，並在資料含多種模式時提供模式篩選。

#### Scenario: 多模式篩選
- **WHEN** 路線資料含多種 route_type
- **THEN** 顯示「全部/公車/火車/渡輪」篩選，選某模式只列該模式路線；每條路線顯示其模式標籤（色彩區分）

#### Scenario: 單一模式不顯示篩選
- **WHEN** 資料只有單一模式
- **THEN** 不顯示模式篩選列（避免無意義分頁）
