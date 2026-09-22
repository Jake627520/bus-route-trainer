# 交接手冊（Handoff）

> 給接手的 agent（例如 **Antigravity**）：若 Claude 額度用完、工作未完成，照這份接手。
> 這份講「現況、下一步、怎麼動手」；長期慣例在 [AGENTS.md](./AGENTS.md)。
> 最後更新：2026-09-20（by Claude Opus 4.8）。

## 一句話
昆士蘭巴士司機「路線記憶訓練器」。後端引擎已完成，**目前在做第一個前端畫面**。

## 技術棧
Next.js 16（App Router）+ React 19 + TypeScript / Prisma 6 + PostgreSQL / Vitest + Testing Library + jsdom / Playwright。流程：OpenSpec + TDD，全程 Docker 容器內。

## 怎麼啟動環境（先做這個）
用 Antigravity 開專案 → `Dev Containers: Reopen in Container`（會自動 `npm ci` + `prisma generate` + `migrate deploy`）。
或用指令：
```bash
export PATH="$HOME/.docker/bin:$PATH"
docker compose up -d db
docker compose run --rm app npm ci
docker compose run --rm app npx prisma generate && docker compose run --rm app npx prisma migrate deploy
docker compose run --rm app npm test          # 應該 228 綠
docker compose run --rm --service-ports app npm run dev   # → http://localhost:3000
```

## 目前狀態（截至 2026-09-20）
**已完成（archived changes，見 `openspec/changes/archive/`）**
- 01 專案/領域基礎、02 GTFS 匯入、03 GTFS 讀取查詢、04 司機學習狀態、05 recall session 領域、06 複習結算。
- 已有 HTTP API（見下）。測試 228 個全綠（含 Prisma/Postgres 整合測試）。
- **已容器化**（Dev Container + Postgres）＋ **CI 改成容器版**（修好原本無 DB 導致 16 檔失敗的問題）。

**還沒做**
- **前端仍是 Next.js 預設樣板**（`src/app/page.tsx`）。使用者還沒有可用畫面 ← 這是目前主線。
- recall session **還沒有 HTTP API**（只有 domain/application 層）。

## 進行中的工作 ← 接手從這裡繼續
Change：`openspec/changes/07-route-browsing-ui/`（第一個前端 vertical slice）。
**接手步驟：**
1. 讀 `openspec/changes/07-route-browsing-ui/tasks.md` —— 勾選狀態就是進度。
2. 從第一個未勾的 task 開始，照 TDD：先寫失敗測試 → 容器內 `npm test` 確認紅 → 最小實作 → 綠。
3. 每完成一個 task 就勾起來、commit。
4. 全部完成 → archive 這個 change、開 PR（CI 會在容器內守門）。

## 現有 API 契約（前端要串這些；成功皆 `{ data: ... }`，錯誤皆 `{ error: { code, message } }`）
- `GET /api/routes` → `{ data: Route[] }`（列出所有路線）
- `GET /api/routes/{routeId}/variants` → `{ data: Variant[] }`；找不到路線回 404 `ROUTE_NOT_FOUND`
- `POST /api/progress/enroll`　body `{ routeId, variantKey }` → 新報名 201 / 已存在 200，`{ data: progress }`；缺欄 400、variant 不存在 404
- `GET /api/progress/{variantKey}` → `{ data: progress }`（查該 variant 的學習進度）

## 重要注意事項
- **Next 16 有破壞性變更**：寫程式前先讀 `node_modules/next/dist/docs/`（見 AGENTS.md）。
- 測試序列化（`vitest run --fileParallelism=false`）因為會打真的 DB；務必先 `docker compose up -d db`。
- Zero-Auth 階段：司機身分用常數 `DEFAULT_DRIVER_ID = 'driver_default_local'`。
- 不要把交接內容寫進 AGENTS.md 的 `<!-- BEGIN/END:nextjs-agent-rules -->` 標記內（`next dev` 會覆寫那段）；標記外才安全。
