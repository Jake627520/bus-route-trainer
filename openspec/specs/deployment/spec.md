# deployment Specification

## Purpose
TBD - created by archiving change 27-deploy-config. Update Purpose after archive.

## Requirements

### Requirement: AUTH_SECRET 生產守衛
系統 SHALL 在 production 阻止使用未設或不安全的 `AUTH_SECRET`。

#### Scenario: production 未設密鑰
- **WHEN** `NODE_ENV=production` 且 `AUTH_SECRET` 未設或等於 dev 後備值
- **THEN** `getAuthSecret()` throw，阻止用可預測密鑰簽 session

#### Scenario: production 已設密鑰
- **WHEN** `NODE_ENV=production` 且 `AUTH_SECRET` 為有效值
- **THEN** `getAuthSecret()` 回傳該值

#### Scenario: 非 production
- **WHEN** `NODE_ENV` 非 production 且未設 `AUTH_SECRET`
- **THEN** `getAuthSecret()` 回傳 dev 後備（本地/測試不受影響）

### Requirement: Serverless 資料庫連線
系統 SHALL 支援 pooled + direct 雙連線：app runtime 用 `DATABASE_URL`（pooled），migration 用 `DIRECT_URL`（direct）。

#### Scenario: 部署 build 套用 migration
- **WHEN** Vercel 執行 `vercel-build`
- **THEN** 先 `prisma generate && prisma migrate deploy`（走 `DIRECT_URL`）再 `next build`

#### Scenario: 本地/CI 單一 DB
- **WHEN** 本地或 CI 無連線池
- **THEN** `DATABASE_URL` 與 `DIRECT_URL` 可指向同一 Postgres，既有測試不受影響

### Requirement: 部署設定與手冊
系統 SHALL 提供 `vercel.json`（build command）與 `DEPLOY.md`（provision DB → 環境變數 → 連 repo → 部署 → 驗證）。

#### Scenario: 依手冊即可上線
- **WHEN** 使用者依 `DEPLOY.md` 設好 DB 與 `DATABASE_URL`/`DIRECT_URL`/`AUTH_SECRET`
- **THEN** 推送 main 觸發 Vercel build，自動套 migration 並部署，首頁未登入導向 `/login`
