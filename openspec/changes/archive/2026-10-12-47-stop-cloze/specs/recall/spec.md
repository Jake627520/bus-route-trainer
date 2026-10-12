# Spec: recall（Change 47 站名填空題）

## ADDED Requirements

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
