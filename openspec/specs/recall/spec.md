# recall Specification

## Purpose
TBD - created by archiving change 47-stop-cloze. Update Purpose after archive.

## Requirements

### Requirement: 沒有路口或站號的站出單字填空
系統 SHALL 對無法出路口填空或站號題的站（如車站），出「單字填空」題（`WORD_CLOZE_RECALL`），而不是提示與答案相同的辨識站名。

#### Scenario: 站名含月台號
- **WHEN** 站名為 `Griffith University station, platform 1`
- **THEN** 提示為 `Griffith University station, platform ______`，答案為 `1`

#### Scenario: 一般車站名稱
- **WHEN** 站名為 `Cultural Centre Station`
- **THEN** 遮住最長的非通用字：提示 `______ Centre Station`，答案 `Cultural`（station/platform/busway/interchange/terminal/terminus/stop/bus 視為通用字，不遮）

#### Scenario: 無可遮的字
- **WHEN** 站名為單一單字或全為通用字（如 `Chermside`、`Bus Station`）
- **THEN** 提示只給每個字的首字母（`C________`、`B__ S______`），答案為完整站名

### Requirement: 提示永不含答案
出題與批改 SHALL 共用同一個推導（`buildStopQuestion`）；任何單字填空題的提示 MUST NOT 包含答案。

### Requirement: 寬鬆批改
`WORD_CLOZE_RECALL` SHALL 以寬鬆站名比對批改（忽略大小寫、標點、常見縮寫差異），不給部分分數。

### Requirement: 上一站題型
系統 SHALL 提供題型 `PREVIOUS_STOP_BACKWARD`：給路線上的某一站，問它的前一站。答案 SHALL 為前一站的站名，並以寬鬆站名比對批改（忽略大小寫、標點、常見縮寫差異），不給部分分數。

#### Scenario: 給站 B 問前一站
- **WHEN** 路線順序為 A → B → C，卡片為 `PREV_STOP::A->B`
- **THEN** 提示顯示 B 的站名，正確答案為 A 的站名

#### Scenario: 路線第一站沒有前一站
- **WHEN** 產生某路線的卡片
- **THEN** 不為第一站產生上一站卡（N 站產生 N−1 張）

### Requirement: 上一站卡與下一站卡獨立排程
`PREV_STOP::` 卡 SHALL 有自己的 SRS 狀態，與同一對相鄰站的 `NEXT_STOP::` 卡互不影響。

### Requirement: 相鄰站名相同時不產生上一站卡
若相鄰兩站的寬鬆站名相同，系統 MUST NOT 為該對產生上一站卡（否則提示即答案）。

### Requirement: 既有報名自動補發且不動既有進度
卡片組版本升到 2 後，系統 SHALL 於既有報名下次開始練習時只**新增**缺少的 `PREV_STOP` 卡；MUST NOT 修改或重建任何既有卡片或其 SRS 進度。
