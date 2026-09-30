# Proposal: 26-auth-wiring

狀態：`proposed`
編號：26。依賴 Change 25（認證基礎）已合入 main。

## Why

Change 25 建好認證機制（Driver 帳號、註冊/登入/登出、session cookie、`resolveDriverId`），
但**尚未接線**：各業務 endpoint 仍寫死 `DEFAULT_DRIVER_ID`，登入的司機資料不會被隔離，頁面也不擋未登入者。
本 change 把 session 接進資料流與頁面路由，讓「登入的司機看到自己的資料、未登入被導向登入頁」。

## 範圍策略（重要）

為降低風險、維持可交付，本 change 採**行為等價接線 + 頁面保護**，刻意不動 use-case 層的後備常數：

- **接線後行為等價**：route 改用 `resolveDriverId(request)`；未帶有效 session cookie 時 `resolveDriverId`
  仍回 `DEFAULT_DRIVER_ID`，故既有 615 測試不需改動即維持綠。**帶有效 session 時**才改用登入司機 → 資料真正隔離。
- **頁面保護**：以 Next 16 `proxy.ts`（原 middleware）擋未登入者訪問受保護頁 → 導向 `/login`；已登入訪問 `/login` → 導回首頁。
- **登出 UI**：首頁顯示目前帳號 + 登出鈕。

> 「移除 use-case 層 `|| DEFAULT_DRIVER_ID` 後備、未登入 API 一律 401」屬純內部強化，會牽動 28 個既有測試檔，
> 留給部署前的收尾 change（Change 27 之前），避免本 PR 過肥、風險集中。頁面層 proxy 已擋住未登入者，真實使用一定經過登入。

## What Changes（Change 26 範圍）

- **session helper**：新增 `readSessionDriverId(request): string | null`（有效 session→driverId，否則 null）；`resolveDriverId` 改用它。
- **recall 身分解析**：`resolveAuthenticatedDriver(request)` 優先讀 session cookie（跨環境，含 prod，不需 trusted gateway）；無 session 時維持既有 trust boundary。
- **API route 接線**：`review/streak`、`review/accuracy`、`review/mastery-trend`、`review/summary`、`progress/enroll`、`progress/[variantKey]` 改用 `resolveDriverId(request)`。
- **頁面保護**：新增 `src/proxy.ts`（matcher 排除 api/_next/靜態/login）；無有效 session → 導 `/login`；已登入訪 `/login` → 導 `/`。
- **UI**：首頁顯示登入帳號 + 登出鈕（`POST /api/auth/logout` 後導 `/login`）。

## Non-goals（留給後續）
- 移除 use-case 層 `DEFAULT_DRIVER_ID` 後備、未登入 API 強制 401（部署前收尾 change）。
- 密碼重設、角色權限、rate limit（之後）。
- Change 27：Vercel 部署設定 + 獨立 DB。

## 風險與測試（TDD）
- `readSessionDriverId`：有效 session→driverId、無/無效/過期→null。
- route 接線：帶有效 session cookie 的請求 → 回登入司機（新測）；無 cookie → 仍 DEFAULT（既有測試不變）。
- `resolveAuthenticatedDriver`：帶 session cookie → 回其 driverId（新測）；無 cookie → 既有行為不變。
- `proxy.ts`：以 `unstable_doesProxyMatch` 驗 matcher；帶/不帶有效 cookie → next/redirect。
- 首頁登出 UI：顯示帳號、點登出打 `/api/auth/logout` 並導 `/login`。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false`（不破壞既有 615）/ `next build`。
