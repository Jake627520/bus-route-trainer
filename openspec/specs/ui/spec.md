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

### Requirement: 共用 review summary
系統 SHALL 讓同一頁多個需要 review summary 的元件共用一次 `GET /api/review/summary`（透過 Provider），且元件在無 Provider 時可自行取用（fallback）。

#### Scenario: 首頁單次抓取
- **WHEN** 首頁同時渲染 HomeHero / ReviewReminder / BatchPracticeButton / ReviewDashboard
- **THEN** 僅觸發一次 `/api/review/summary`，各元件共用結果

#### Scenario: 獨立使用 fallback
- **WHEN** 元件在沒有 Provider 的情境被渲染（如獨立測試）
- **THEN** 該元件自行抓取 summary，行為與過去一致

### Requirement: 共用 practice streak
系統 SHALL 讓同一頁多個需要 streak 的元件共用一次 `GET /api/review/streak`（透過 Provider），且元件在無 Provider 時可自行取用（fallback）。

#### Scenario: 首頁單次抓取
- **WHEN** 首頁同時渲染 HomeHero 與 StreakStat
- **THEN** 僅觸發一次 `/api/review/streak`，兩者共用結果

#### Scenario: 獨立使用 fallback
- **WHEN** 元件在沒有 Provider 的情境被渲染
- **THEN** 該元件自行抓取 streak，行為與過去一致
