# Spec: gtfs-import（Change 40 自動更新）

## ADDED Requirements

### Requirement: 每週自動更新
系統 SHALL 以 GitHub Actions 排程每週下載 SEQ GTFS feed，比對版本（feed_info 的 start-end date），有更新才重新匯入 Neon（bus 全 + ferry 全 + train 子集），並更新版本標記。

#### Scenario: feed 有更新
- **WHEN** 最新 feed 版本與記錄的不同
- **THEN** 以 --clear 重灌 bus+ferry+train 子集到 Neon，並 commit 新版本標記

#### Scenario: feed 無更新
- **WHEN** 版本相同
- **THEN** 跳過匯入（no-op）

### Requirement: 重新整理匯入
系統 SHALL 提供 `--clear` 讓匯入前清空 gtfs 表，使 DB 與新 feed 一致（移除的路線不殘留）；driver 學習進度為 soft ref 不受影響。
