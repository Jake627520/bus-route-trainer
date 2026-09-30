# Proposal: 27-deploy-config

狀態：`proposed`
編號：27。依賴 Change 25/26（認證）已合入 main。

## Why

認證已就緒，專案具備上線條件，但尚無部署設定：Prisma 未針對 serverless 連線池、build 未套用 migration、`AUTH_SECRET` 未設時會**靜默**退回不安全的 dev 後備。本 change 讓專案可安全部署到 **Vercel + 獨立 Postgres**（使用者已確認：獨立 DB、Vercel）。

## 範圍策略

部署牽涉外部帳號與密鑰（Vercel 專案、DB provisioning、環境變數），無法全自動。本 change：

- **可自動化且可測**：`AUTH_SECRET` 生產守衛（prod 未設 → fail fast，不再靜默用 dev 後備）。
- **設定檔**：Prisma `directUrl`（pooled + direct 供 migration）、build 腳本套 `prisma generate` + `migrate deploy`、`.env.example` 補齊、`vercel.json`（build command）。
- **手冊**：`DEPLOY.md` 逐步 runbook（provision DB → 設 Vercel 環境變數 → 連 repo → 部署 → 驗證），交由使用者執行需帳號/密鑰的步驟。

## 技術決策

1. **AUTH_SECRET 守衛**：`getAuthSecret()` 在 `NODE_ENV==='production'` 且未設（或等於 dev 後備值）時 throw；非 prod 維持 dev 後備（測試/本地不受影響）。
2. **serverless DB 連線**：Prisma `datasource` 加 `directUrl = env("DIRECT_URL")`；`DATABASE_URL` 用 pooled 連線（Vercel Postgres/Neon 的 pooler），`DIRECT_URL` 用 direct 連線供 `migrate deploy`。
3. **build**：`vercel-build`（或 build）＝ `prisma generate && prisma migrate deploy && next build`；`postinstall` 確保 `prisma generate`。
4. **不在此 change provision 真實資源**：DB/密鑰/Vercel 連結由使用者依 `DEPLOY.md` 執行。

## What Changes

- `src/infrastructure/auth/session-cookie.ts`：`getAuthSecret` 加生產守衛。
- `prisma/schema.prisma`：`datasource` 加 `directUrl`。
- `package.json`：build/vercel-build/postinstall 腳本。
- `.env.example`：補 `AUTH_SECRET`、`DIRECT_URL`。
- 新增 `vercel.json`、`DEPLOY.md`。

## Non-goals（後續）
- 實際 provision DB、設定 Vercel 專案與密鑰（使用者依 runbook 執行）。
- CI 自動部署（Vercel Git 整合預設即可，之後再議）。
- GTFS 匯入子集（另開 change）。

## 風險與測試（TDD）
- `getAuthSecret` 守衛：prod 未設→throw；prod 有設→回該值；非 prod 未設→回 dev 後備。（測試切換 `NODE_ENV`，afterEach 還原）
- 其餘為設定檔/文件，靠 `next build` 守門與人工 review；不破壞既有 633 測試。
