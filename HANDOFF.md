# 交接手冊（Handoff）

> 給接手的 agent（例如 **Antigravity**）：若 Claude 額度用完、工作未完成，照這份接手。
> 這份講「現況、下一步、怎麼動手」；長期慣例在 [AGENTS.md](./AGENTS.md)。
> 最後更新：2026-09-23（by Claude Opus 4.8）。

## 一句話
昆士蘭巴士司機「路線記憶訓練器」。後端引擎、recall session（API + 練習 UI）、以及**第一個路線瀏覽前端**都已完成；目前**沒有進行中的 change**。

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
docker compose run --rm app npm test          # 應該 493 綠
docker compose run --rm --service-ports app npm run dev   # → http://localhost:3000
```

## 目前狀態（截至 2026-09-23）
**已完成（archived changes，見 `openspec/changes/archive/`）**
- 01 專案/領域基礎、02 GTFS 匯入、03 GTFS 讀取查詢、04 司機學習狀態、05 recall session 領域、06 複習結算。
- 07（srs-scheduling）SRS 排程、08 recall session flow、**09 recall session HTTP API**、**10 recall 練習 UI（/practice/recall）**。
- **07（route-browsing-ui）第一個路線瀏覽前端**：`/` 路線列表、`/routes/[routeId]` variant 列表 + 報名、`src/app/_lib/api-client.ts` 薄封裝。
- 已有完整 HTTP API（見下）。測試 493 個全綠。已容器化（Dev Container + Postgres）＋ CI 容器版。
- ⚠️ **編號撞號**：歷史上有兩個「07」——`archive/2026-09-22-07-srs-scheduling` 與 `archive/2026-09-23-07-route-browsing-ui`。歸檔後已用日期前綴區分、不再衝突；下一個 change 請直接跳號到 **11** 以上，別再用 07。

**還沒做（下一步候選，尚無提案）**
- SRS 排程 / 複習到期的前端視覺化（後端 07-srs-scheduling 已完成，缺畫面）。
- 樣式打磨、a11y 深化、i18n、認證（目前 zero-auth）。

## 進行中的工作 ← 接手從這裡繼續
**目前沒有未 archive 的 change**（`openspec/changes/` 只剩 `archive/`）。接手方式：
1. 與人確認下一個要做的功能 → 依 AGENTS.md 開一個新 change（編號 ≥ 11）：`openspec/changes/NN-xxx/`（proposal + tasks）→ 人審。
2. 從第一個未勾 task 照 TDD：先寫失敗測試 → `npm test` 確認紅 → 最小實作 → 綠 → 勾選並 commit。
3. 全部完成 → 守門三綠（lint/test/build）→ archive → 開 PR（CI 守門）。
- 註：前端測試 mock fetch、不需 DB；本機 `npx vitest run --fileParallelism=false` 目前 493 綠。容器仍是 canonical 路徑（整合測試打真 DB）。

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
