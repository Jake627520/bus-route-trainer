# Spec: ui（Change 36 骨架 + 首頁錨點）

## ADDED Requirements

### Requirement: 載入骨架
系統 SHALL 以骨架佔位（而非純文字）呈現清單類元件的載入狀態，並維持 `role="status"` 無障礙語意。

#### Scenario: 清單載入中
- **WHEN** review 儀表板 / 路線列表 / variant 列表資料尚未返回
- **THEN** 顯示與內容等高的 shimmer 骨架卡；reduced-motion 時關閉動畫

### Requirement: 首頁深色 feature 錨點
系統 SHALL 在首頁提供一塊深色漸層卡作為視覺焦點，彙總今日待複習數與連續天數，到期時提供「立即複習」入口。

#### Scenario: 有到期
- **WHEN** 今日有到期卡片
- **THEN** 錨點顯示到期數與「立即複習」deep-link（連到最該複習的 variant）

#### Scenario: 無到期
- **WHEN** 今日無到期
- **THEN** 錨點顯示「已全部複習完」鼓勵訊息
