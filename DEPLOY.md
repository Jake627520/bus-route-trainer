# 部署手冊（Vercel + 獨立 Postgres）

> Change 27 產出。程式面已就緒；以下需要你的帳號/密鑰的步驟由你執行。
> 技術棧：Next.js 16（App Router）+ Prisma 6 + PostgreSQL。認證＝自建帳號密碼 + 簽章 session cookie。

## 架構決策
- **獨立 DB**（不與問卷系統共用）+ **Vercel** 部署。
- Serverless 連線：`DATABASE_URL`＝pooled 連線（給 app runtime）、`DIRECT_URL`＝direct 連線（給 `prisma migrate deploy`）。
- Build 指令＝`npm run vercel-build`（`prisma generate && prisma migrate deploy && next build`），已寫進 `vercel.json`。

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
| `DATABASE_URL` | 步驟 1 的 **pooled** 連線字串 | Production（＋ Preview） |
| `DIRECT_URL` | 步驟 1 的 **direct** 連線字串 | Production（＋ Preview） |
| `AUTH_SECRET` | `openssl rand -base64 32` 產生的強隨機值 | Production（＋ Preview） |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` 的 **Public Key**（公開，建置時內嵌，改了要重新部署） | Production |
| `VAPID_PRIVATE_KEY` | 同上的 **Private Key**（機密，勿外洩、勿進 repo） | Production |
| `VAPID_SUBJECT` | `mailto:你的信箱` | Production |
| `CRON_SECRET` | `openssl rand -base64 32` 產生的隨機值（Vercel cron 會自動帶 `Authorization: Bearer`） | Production |

> ⚠️ `AUTH_SECRET` 在 production 未設或仍是 dev 後備值時，程式會**啟動即報錯**（防止用可預測密鑰簽 session）。務必設定。

> 🔒 **認證限流（Change 49）**：login／register／forgot／reset 有次數限制，計數存在資料庫的 `auth_rate_limit` 表（`vercel-build` 的 `prisma migrate deploy` 會自動建立）。IP 取自 `x-forwarded-for` 第一個值——**上線後請用真實請求確認它是用戶端真實 IP**。緊急時可設環境變數 `RATE_LIMIT_DISABLED=1` 暫時關閉限流（記得事後移除）。

## 步驟 4：部署
- 推送到 `main`（或按 Vercel 的 Deploy）。`vercel-build` 會自動 `prisma migrate deploy` 把 schema 套到新 DB，再 `next build`。
- 首次部署會建立所有資料表（含 `driver` 帳號表）。

## 步驟 5：驗證
1. 開部署網址 → 未登入應被導向 `/login`。
2. 註冊一個帳號 → 自動可登入 → 回首頁看到帳號 + 登出鈕。
3. （選）匯入 GTFS 資料後，首頁「所有路線」才有內容（見 GTFS 匯入 change）。

---

## 每日複習提醒驗證（Change 52）
- cron 定義在 `vercel.json`（`0 19 * * *` = Brisbane 05:00；Hobby 方案一天一次、實際可能晚到一小時內）。Vercel → Project → Settings → Cron Jobs 可看到並手動執行。
- 手機實機：Android 用 Chrome 開網站 → 首頁「每日複習提醒」按「開啟」→ 允許通知。iPhone 要**先加到主畫面**再從主畫面開啟。
- 手動觸發一次：`curl -H "Authorization: Bearer $CRON_SECRET" https://<網址>/api/cron/review-reminders`。有到期卡片、且今天沒練習過，應收到「你有 N 張卡片待複習」。回應 `{"data":{"skipped":true}}` 代表 VAPID 變數沒設好。
- 同一天再打一次不應再收到（每日去重）。登出後該裝置不應再收到通知。

## PWA 驗證（Change 51）
部署後用手機 Chrome／Safari 開網站：選單應出現「加到主畫面／安裝」；開飛航模式再開 App 應看到「目前離線」頁而非瀏覽器錯誤。`/sw.js`、`/manifest.webmanifest`、`/offline.html` 與圖示不需登入即可存取（`src/proxy.ts` 已排除）。緊急停用 SW 見 HANDOFF.md。

## 疑難排解
- **部署 build 失敗在 migrate**：多半是 `DIRECT_URL` 沒設或用了 pooled URL。migrate 必須走 direct 連線。
- **登入後又被導回登入頁**：cookie 沒帶上，確認網址是 https（SameSite=Lax + Secure 需 https）。
- **啟動報 AUTH_SECRET 錯**：production 未設 `AUTH_SECRET`，到 Settings 補上後 redeploy。
- **本地開發**：`.env` 內 `DATABASE_URL` 與 `DIRECT_URL` 指同一個本地 Postgres 即可（見 `.env.example`）。
