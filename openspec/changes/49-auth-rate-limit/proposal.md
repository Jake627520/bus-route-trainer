# Proposal: 49-auth-rate-limit

狀態：`proposed`（待人審，審過才開工）
編號：49。依賴 Change 41/42（密碼重設、密碼強度）已合入 main。

## Why
網站已公開上線，但所有認證端點都**沒有任何次數限制**：

| 端點 | 可被濫用成什麼 |
|---|---|
| `POST /api/auth/login` | 無限次猜密碼（撞庫、暴力破解） |
| `POST /api/auth/register` | 大量灌假帳號 |
| `POST /api/auth/forgot` | 對任意 email 狂寄重設信，燒掉 Resend 額度、騷擾他人信箱 |
| `POST /api/auth/reset` | 無限次猜重設 token |

目前程式裡也完全沒有取得用戶端 IP 的邏輯（`grep x-forwarded-for` 無結果）。

## 設計決策（請審這幾點）
1. **用資料庫計數，不用記憶體**：部署在 Vercel 無伺服器，每個請求可能落在不同實例，記憶體計數互相看不到、形同無效。新增一張 Postgres 表存「key + 時間窗 + 次數」，以單一原子 upsert 遞增（並發安全）。
   - 不採 Redis／Upstash：要多申請一個服務與密鑰，現階段流量用不到。若日後流量大再換，介面（port）已隔離。
2. **固定時間窗計數**（fixed window），簡單、可預測、好測試。
3. **兩層限制**，且「每個 IP」的上限要寬鬆——司機常共用站場 Wi‑Fi／電信業者的共用 IP，太緊會誤傷同事：

   | 端點 | 每 IP | 每帳號／email | 超過時 |
   |---|---|---|---|
   | login | 30 次 / 15 分 | 同一帳號**失敗** 5 次 / 15 分 | 429 |
   | register | 10 次 / 1 小時 | — | 429 |
   | forgot | 10 次 / 1 小時 | 同一 email 3 次 / 1 小時 | IP 超限 429；email 超限**靜默回 200 且不寄信**（不洩漏該 email 是否存在） |
   | reset | 20 次 / 1 小時 | — | 429 |

   數字集中放在一個設定檔，可日後調整。
4. **帳號鎖定是「暫時的」**：失敗 5 次只鎖該帳號 15 分鐘，且**登入成功即清除失敗計數**。不做永久鎖定，避免有人故意亂試別人的帳號把對方鎖死。
5. **回應**：HTTP 429 + `Retry-After` 標頭 + `{ error: { code: 'RATE_LIMITED', message } }`。前端依 `code` 顯示 i18n 訊息（含「請 N 分鐘後再試」）。
6. **取得 IP**：讀 `x-forwarded-for` 第一個值（Vercel 由平台設定、用戶端無法偽造——**此點需在正式環境驗證**）；取不到時用單一共用 key `unknown`（寧可保守限流，也不放行）。
7. **限流資料庫故障時 fail-open**（記 log、放行），不因限流元件壞掉而讓所有人登不進去。
8. **清理**：寫入時順便刪除 1 天前的過期列，不另設排程。

## What Changes
- Prisma：新增 `auth_rate_limit`（`key` + `windowStart` 唯一、`count`）+ migration。
- 應用層：`CheckRateLimit`（port + 純邏輯，可注入 clock）。
- 基礎設施：`PrismaRateLimitRepository`（原子遞增）、`getClientIp(request)`。
- 路由：login／register／forgot／reset 接上限流。
- 前端：登入、忘記密碼、重設密碼頁處理 `RATE_LIMITED`；i18n（en／zh-TW）。
- 規格：`driver-auth` 新增需求。

## Non-goals
- CAPTCHA、IP 信譽／黑名單、雙因素驗證、通知用戶「有人在試你的帳號」。
- 對資料 API（路線／練習）限流。
- 改密碼雜湊演算法或 session 機制。

## 風險與測試（TDD）
- **誤傷共用 IP**：每 IP 上限放寬（見上表），並在 PR 說明如何調整。
- **取不到真實 IP**：全部人共用 `unknown` key 會互相影響 → 以測試覆蓋 header 缺失行為，並在部署後用真實請求驗證。
- 單元：`CheckRateLimit`（用假 clock 與記憶體 repo）——窗內累加、跨窗歸零、超限、登入成功清除失敗計數。
- 整合（需 DB）：repository 並發遞增不遺漏、過期清理。
- 路由：連打到上限 → 429 + `Retry-After`；forgot email 超限仍回 200 且不呼叫寄信。
- 前端：`RATE_LIMITED` 顯示對應 i18n 訊息。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## 待你決定
- 上表的次數與時間窗是否合適（特別是 login 每 IP 30 次、每帳號失敗 5 次）。
- email 超限時「靜默 200」是否接受（對使用者較不透明，但不洩漏帳號）。
