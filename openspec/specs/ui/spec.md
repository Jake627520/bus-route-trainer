# ui Specification

## Purpose
TBD - created by archiving change 34-visual-polish. Update Purpose after archive.

## Requirements

### Requirement: 一致的品牌視覺
系統 SHALL 以 **Translink 官方配色**呈現：深藍 #242B4C 為主色（按鈕/文字/徽章/進度條），洋紅 #EF60A3 為點綴（少量 pop）。

#### Scenario: 主要操作按鈕為品牌藍
- **WHEN** 顯示主要 CTA（開始練習/複習/登入）
- **THEN** 以 Translink 深藍 #242B4C 底白字呈現（AAA 對比）

#### Scenario: 深色模式
- **WHEN** 系統為深色模式
- **THEN** 深藍黑紙感底 #0e1326，品牌與粉紅改用較亮階

#### Scenario: 粉紅點綴
- **WHEN** 顯示 streak 連續天數、批次練習 hero、作用中語言
- **THEN** 以 Translink 洋紅呈現；承白字處用深粉 #C42D7B（AA）
