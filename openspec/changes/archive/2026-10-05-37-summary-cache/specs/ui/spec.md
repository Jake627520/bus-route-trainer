# Spec: ui（Change 37 共用 summary）

## ADDED Requirements

### Requirement: 共用 review summary
系統 SHALL 讓同一頁多個需要 review summary 的元件共用一次 `GET /api/review/summary`（透過 Provider），且元件在無 Provider 時可自行取用（fallback）。

#### Scenario: 首頁單次抓取
- **WHEN** 首頁同時渲染 HomeHero / ReviewReminder / BatchPracticeButton / ReviewDashboard
- **THEN** 僅觸發一次 `/api/review/summary`，各元件共用結果

#### Scenario: 獨立使用 fallback
- **WHEN** 元件在沒有 Provider 的情境被渲染（如獨立測試）
- **THEN** 該元件自行抓取 summary，行為與過去一致
