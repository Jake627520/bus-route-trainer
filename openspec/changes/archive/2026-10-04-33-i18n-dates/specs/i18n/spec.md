# Spec: i18n（Change 33 時間在地化）

## ADDED Requirements

### Requirement: 以澳洲（Brisbane）時區決定日界
系統 SHALL 以 `Australia/Brisbane`（UTC+10）決定所有「以日為單位」的計算（streak、精熟度趨勢、attempt 日期分組），不使用 UTC 日界。

#### Scenario: 清晨練習計入當地當天
- **WHEN** 司機在 Brisbane 當地清晨（對應前一 UTC 日）完成練習
- **THEN** streak 與趨勢將其計入 Brisbane 當天，而非 UTC 前一天

### Requirement: 相對時間在地化
系統 SHALL 讓複習時間的相對顯示（formatDistanceToNow）依 UI 語言顯示（zh-TW / en）。

#### Scenario: 切語言
- **WHEN** 以 zh-TW 檢視複習儀表板
- **THEN** 「下次複習」的相對時間以中文顯示
