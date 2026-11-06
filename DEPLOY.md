# 部署手冊（Vercel + 獨立 Postgres）

> Change 27 產出。程式面已就緒；以下需要你的帳號/密鑰的步驟由你執行。
> 技術棧：Next.js 16（App Router）+ Prisma 6 + PostgreSQL。認證＝自建帳號密碼 + 簽章 session cookie。

## 架構決策
- **獨立 DB**（不與問卷系統共用）+ **Vercel** 部署。
- Serverless 連線：`DATABASE_URL`＝pooled 連線（給 app runtime）、`DIRECT_URL`＝direct 連線（給 `prisma migrate deploy`）。
- Build 指令＝`npm run vercel-build`（`scripts/vercel-build.sh`），已寫進 `vercel.json`。一律 `prisma generate`，然後：
  - **Production**（`VERCEL_ENV=production`）：`prisma migrate deploy`（走 `DIRECT_URL`），再 `next build`。
  - **Preview**：只有設定了 **不是 production** 的 `PREVIEW_DIRECT_URL` 才 migrate，而且只用那個 URL，**不會**用 `DIRECT_URL`。沒設就只 `next build`。
  - 本地／CI 不經這個腳本 migrate（CI 在自己的資料庫步驟跑 `prisma migrate deploy`，`npm run build` 仍是 `next build`）。

---

## 步驟 1：Provision 一個 Postgres

擇一（都提供 pooled + direct 兩種連線字串）：

- **Vercel Postgres**（最省事，Vercel Dashboard → Storage → Create → Postgres）：建立後會給 `POSTGRES_PRISMA_URL`（pooled）與 `POSTGRES_URL_NON_POOLING`（direct）。
- **Neon**（neon.tech）：專案建立後，Connection Details 提供 pooled（`-pooler` host）與 direct 兩種 URL。

記下兩個連線字串：一個 **pooled**、一個 **direct**。

## 步驟 2：連 Vercel 專案
1. Vercel Dashboard → Add New → Project → Import `Jake627520/bus-route-trainer`。
2. Framework 會自動偵測 Next.js；Build Command 由 `vercel.json` 指定為 `npm run vercel-build`，不用改。

## 步驟 3：設定環境變數（Vercel → Project → Settings → Environment Variables）
| 變數 | 值 | 環境 |
|---|---|---|
| `DATABASE_URL` | Production 的 **pooled** 連線字串 | Production |
| `DIRECT_URL` | Production 的 **direct** 連線字串 | Production |
| `AUTH_SECRET` | `openssl rand -base64 32` 產生的強隨機值 | Production（＋ Preview） |
| `APP_URL` | 對外正式網址，例如 `https://<你的網域>`。重設密碼信的連結用它（不用 request Host，防 reset poisoning）；未設時 production 不寄重設信 | Production（Preview 要測重設信才設） |
| `DATABASE_URL` | **另一個**資料庫的 pooled 連線字串（見下方） | Preview |
| `PREVIEW_DIRECT_URL` | **同一個** Preview 資料庫的 direct 連線字串 | Preview |

> **Preview 資料庫（擁有者要設，這個變更不會改 Vercel 環境變數）**
> 程式與 `DEPLOY.md` 原先把 Preview 和 Production 設成同一組 `DATABASE_URL`／`DIRECT_URL`。倉庫裡沒有獨立的 preview 連線。Preview build **不會**對 `DIRECT_URL` 跑 migrate，避免在 preview 部署時改到 production。
>
> 要讓 Preview 套用 migration（含 `driver.session_version`）並使用撤銷功能：
> 1. 另建一個 Postgres，**不要**用 production 那顆。
> 2. Vercel → Project → Settings → Environment Variables，**只勾 Preview**：
>    - `DATABASE_URL`＝這顆庫的 pooled URL（runtime 用這個）。
>    - `PREVIEW_DIRECT_URL`＝這顆庫的 direct URL（不可含 pooler）。**不要**把 production 的 direct URL 填進來。
> 3. 重新部署該 Preview。`vercel-build` 只會對 `PREVIEW_DIRECT_URL` 執行 `prisma migrate deploy`。
>
> 還沒設 `PREVIEW_DIRECT_URL` 時，Preview 仍可啟動：session 檢查若發現沒有 `session_version` 欄位，會把既有 driver 當成版本 0（已刪除的 driver 仍算未登入），登出的撤銷變成 no-op（瀏覽器 cookie 仍會清掉）。登入／註冊的查詢也不會選這個欄位。撤銷要等欄位存在才會生效。Production 行為不變：production build 仍用 `DIRECT_URL` migrate。

> ⚠️ `AUTH_SECRET` 在 production 未設或仍是 dev 後備值時，程式會**啟動即報錯**（防止用可預測密鑰簽 session）。務必設定。

> 🔒 **認證限流（Change 49）**：login／register／forgot／reset 有次數限制，計數存在資料庫的 `auth_rate_limit` 表（production 的 `vercel-build` 會 `prisma migrate deploy` 並自動建立）。IP 取自 `x-forwarded-for` 第一個值——**上線後請用真實請求確認它是用戶端真實 IP**。緊急時可設環境變數 `RATE_LIMIT_DISABLED=1` 暫時關閉限流（記得事後移除）。

## 步驟 4：部署
- 推送到 `main`（或按 Vercel 的 Deploy）。production 的 `vercel-build`（`VERCEL_ENV=production`）會自動 `prisma migrate deploy` 把 schema 套到 production DB，再 `next build`。Preview 只有在設了 `PREVIEW_DIRECT_URL` 時才 migrate 那顆獨立資料庫。
- 首次部署會建立所有資料表（含 `driver` 帳號表）。

## 步驟 5：驗證
1. 開部署網址 → 未登入應被導向 `/login`。
2. 註冊一個帳號 → 自動可登入 → 回首頁看到帳號 + 登出鈕。
3. （選）匯入 GTFS 資料後，首頁「所有路線」才有內容（見 GTFS 匯入 change）。

---

## PWA 驗證（Change 51）
部署後用手機 Chrome／Safari 開網站：選單應出現「加到主畫面／安裝」；開飛航模式再開 App 應看到「目前離線」頁而非瀏覽器錯誤。`/sw.js`、`/manifest.webmanifest`、`/offline.html` 與圖示不需登入即可存取（`src/proxy.ts` 已排除）。緊急停用 SW 見 HANDOFF.md。

## 疑難排解
- **production 部署 build 失敗在 migrate**：多半是 `DIRECT_URL` 沒設或用了 pooled URL。migrate 必須走 direct 連線。
- **Preview 沒有套到新欄位**：確認 Preview 環境有獨立的 `DATABASE_URL` 與 `PREVIEW_DIRECT_URL`，且後者不是 production。沒設時 build 會成功，但 `session_version` 不會被建立。
- **登入後又被導回登入頁**：cookie 沒帶上，確認網址是 https（SameSite=Lax + Secure 需 https）。
- **啟動報 AUTH_SECRET 錯**：production 未設 `AUTH_SECRET`，到 Settings 補上後 redeploy。
- **本地開發**：`.env` 內 `DATABASE_URL` 與 `DIRECT_URL` 指同一個本地 Postgres 即可（見 `.env.example`）。
