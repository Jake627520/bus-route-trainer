# Tasks: 27-deploy-config

> TDD 用於 AUTH_SECRET 守衛；其餘為設定檔/文件，靠 next build 守門。守門：`eslint` / `vitest run --fileParallelism=false`（不破壞既有 633）/ `next build`。

## Phase 27.1: AUTH_SECRET 生產守衛（TDD）
- [x] Task 1: `getAuthSecret` prod 未設/等於 dev 後備→throw；prod 有設→回值；非 prod→dev 後備。測試 + 實作 <!-- id: 27-01 -->

## Phase 27.2: 部署設定檔
- [x] Task 2: Prisma `datasource` 加 `directUrl = env("DIRECT_URL")` <!-- id: 27-02 -->
- [x] Task 3: `package.json` build/vercel-build/postinstall 套 prisma generate + migrate deploy <!-- id: 27-03 -->
- [x] Task 4: `.env.example` 補 AUTH_SECRET / DIRECT_URL；新增 `vercel.json` <!-- id: 27-04 -->

## Phase 27.3: 部署手冊
- [x] Task 5: `DEPLOY.md` runbook（provision DB → Vercel 環境變數 → 連 repo → 部署 → 驗證 + migration） <!-- id: 27-05 -->

## Phase 27.4: 守門與收尾
- [x] Task 6: 全套守門（lint + test + build 全綠；不破壞既有 633）<!-- id: 27-06 -->
- [x] Task 7: 建 spec；archive；開 PR、CI 綠 auto-merge <!-- id: 27-07 -->

## 注意
- 本 change 不 provision 真實資源；DB/密鑰/Vercel 連結由使用者依 DEPLOY.md 執行。
- getAuthSecret 守衛只在 NODE_ENV=production 生效，測試/本地不受影響。
