<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- 以下為專案自有內容，位於 next 管理標記之外，`next dev` 不會覆寫。 -->

## 開發環境與交接（Claude ↔ Antigravity）

**任何 agent（Claude Code / Antigravity）接手前，先讀 [HANDOFF.md](./HANDOFF.md)。** 那裡有「目前做到哪、下一步、怎麼接手」。

### 技術棧
- Next.js 16（App Router）+ React 19 + TypeScript
- Prisma 6 + PostgreSQL
- 測試：Vitest（+ Testing Library / jsdom）、Playwright（e2e）
- 流程：**OpenSpec（規格先行）+ TDD**

### 一律在容器內跑（Docker）
- Antigravity：`Dev Containers: Reopen in Container`（自動 `npm ci` + `prisma generate` + `migrate deploy`）
- 或指令（在主機、加 `~/.docker/bin` 到 PATH）：
  - `docker compose up -d db`
  - `docker compose run --rm app npm test`
  - `docker compose run --rm --service-ports app npm run dev` → http://localhost:3000
- **絕不在主機直接跑 node/npm**（環境不一致、缺 DB）。

### 開發循環
1. OpenSpec 提案：`openspec/changes/NNN-xxx/`（proposal.md + tasks.md）→ 人審通過
2. TDD 紅→綠→重構，全程容器內 `npm test`
3. 完成後 archive change、更新 `openspec/specs/`、開 PR（CI 在容器內守門）

### 進度在哪（交接的核心）
- **「目前做到哪」= `openspec/changes/` 內未 archive 的 change 的 `tasks.md`**：勾選狀態就是進度，接手者從第一個未勾的 task 繼續。
- 已完成的功能看 `openspec/changes/archive/`。
