# Spec: ui（Change 38 共用 streak）

## ADDED Requirements

### Requirement: 共用 practice streak
系統 SHALL 讓同一頁多個需要 streak 的元件共用一次 `GET /api/review/streak`（透過 Provider），且元件在無 Provider 時可自行取用（fallback）。

#### Scenario: 首頁單次抓取
- **WHEN** 首頁同時渲染 HomeHero 與 StreakStat
- **THEN** 僅觸發一次 `/api/review/streak`，兩者共用結果

#### Scenario: 獨立使用 fallback
- **WHEN** 元件在沒有 Provider 的情境被渲染
- **THEN** 該元件自行抓取 streak，行為與過去一致
