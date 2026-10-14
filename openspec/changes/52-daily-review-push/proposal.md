# Proposal: 52-daily-review-push

狀態：`proposed`（待人審，審過才開工）
編號：52。依賴 Change 51（PWA／service worker）已合入 main。

## Why
間隔複習（SRS）的效果完全取決於「使用者有沒有照時間回來複習」。目前唯一的提醒（Change 23 `ReviewNotifier`）要**網頁開著**才會跳通知——人沒開網頁就等於沒有提醒，最需要被提醒的「已經忘了這個 App」的人反而收不到。

Change 51 讓網站可裝到手機主畫面、有了 service worker，這是「伺服器主動推播」的前提。本 change 做**每日一則、只在有卡片到期時才發**的複習提醒。

## 名詞（白話）
- **推播（Web Push）**：手機主動跳出的通知，不用開 App。瀏覽器廠商（Google／Apple）的伺服器幫忙轉送。
- **訂閱（subscription）**：每台裝置同意收通知後，瀏覽器給的一組「地址＋鑰匙」，我們存起來，之後才有辦法寄給那台裝置。
- **VAPID 金鑰**：一對我們自己產生的「身分證」，證明通知是從我們網站發的。公鑰放前端、私鑰只放伺服器。
- **cron**：Vercel 的定時器，每天固定時間呼叫我們一個網址。

## 設計決策（請審這幾點）
1. **opt-in、每台裝置各自開關**：首頁按「開啟每日提醒」→ 瀏覽器詢問權限 → 訂閱。不自動要權限。關閉＝刪除該裝置訂閱。同一帳號可有多台裝置。
2. **每天最多一則，且只在有到期卡片時發**：伺服器對每個有訂閱的司機計算「到期卡片數」，`> 0` 才發。再加兩道防吵：
   - 同一個 Brisbane 日（沿用 Change 33 日界）已發過就不再發（cron 重跑也不會重複）。
   - 司機**今天已經練習過**就跳過（已經在用了，不需要再提醒）。
3. **內容只寫數量，不含任何題目或站名**：例「你有 12 張卡片要複習」。通知會出現在鎖定畫面，不能洩漏學習內容；也與「答案不外洩」原則一致。語言用訂閱當下的介面語言（en／zh-TW）存起來。
4. **發送時間：每天一次，固定 Brisbane 16:00**（= UTC 06:00，Brisbane 無夏令時間），常數集中一處。
   - 為什麼不做「每人自選時間」：需要每小時甚至更密的 cron；Vercel Hobby 方案**只允許每天一次**，設更密的 cron 會讓**部署失敗**。第一版不冒這個險。若你的 Vercel 是 Pro，可在後續 change 加「自選時間」。
   - Hobby 方案的 cron 時間點不精準（可能晚到一小時內），對「每天一則提醒」可接受。
5. **cron 端點只認密鑰**：`GET /api/cron/review-reminders` 需 `Authorization: Bearer $CRON_SECRET`（Vercel cron 會自動帶），用定時比較防旁路；沒帶或錯誤回 401。`src/proxy.ts` 為它開例外（它不走使用者 session），並有測試。
6. **用 `web-push` 套件**：Web Push 的訊息加密與 VAPID 簽章不該自己手寫。放在 port 後面（`PushSender`），測試用假的。這是**新增一個正式相依**，請確認接受。
7. **失效訂閱自動清除**：推播服務回 404／410（使用者撤銷或裝置失效）→ 刪除該訂閱。其他暫時性錯誤只記 log，下次再試。
8. **登出時移除本機訂閱**：共用手機登出後，不能繼續收到上一個人的提醒。登出流程 best-effort 呼叫取消訂閱。
9. **沒設定就整個關閉**：缺 VAPID／CRON 環境變數時，前端不顯示開關、cron 端點回 200 `{ skipped: true }`，不影響其他功能。
10. **service worker 只加兩個事件**：`push`（一定要顯示通知，瀏覽器要求；內容解析失敗也顯示通用文字）與 `notificationclick`（只開同網域路徑，用白名單擋掉外部網址）。SW 的 `VERSION` 升為 `v2`。SW 其餘行為不動。
11. **發送上限**：單次 cron 以 20 個一批平行發送，並設總處理數上限與逾時保護（Vercel 函式有時間限制）；超出的下次再補（以「今天尚未發」為條件，自然續跑）。目前使用者規模遠低於上限。

## What Changes
- Prisma：新增 `push_subscription`（`driverId`、`endpoint` 唯一、`p256dh`、`auth`、`locale`、`lastSentDay`、`createdAt`）+ migration。
- 應用層：`SubscribeToPush`／`UnsubscribeFromPush`、`SendDailyReviewReminders`（計算到期數、日界去重、今天已練習跳過、清除失效訂閱）、`PushSender` port。
- 基礎設施：`PrismaPushSubscriptionRepository`、`WebPushSender`（`web-push`）、「每位司機到期卡片數」純計數查詢（不載入站名／車次，避免 N+1）。
- API：`POST /api/push/subscribe`、`POST /api/push/unsubscribe`（需登入）、`GET /api/cron/review-reminders`（密鑰）。
- 前端：首頁 `PushReminderToggle`（狀態：不支援／iOS 需先加到主畫面／已拒絕／可開啟／已開啟）；與現有前景 `ReviewNotifier` 整併，避免同時出現兩種提醒鈕；登出時取消訂閱；i18n（en／zh-TW）。
- `public/sw.js`：`push`、`notificationclick`；`vercel.json`：cron（`0 6 * * *` UTC）；`src/proxy.ts` 例外。
- 文件：HANDOFF／DEPLOY（產生 VAPID 金鑰、設環境變數、驗證步驟）。

## Non-goals
- 每人自選提醒時間、一天多則、「連續天數快斷了」等進階提醒（日後視 Vercel 方案再做）。
- Email／簡訊提醒。
- 通知上的動作按鈕、圖片、隱藏題目預覽。
- iOS 16.4 以下（不支援網頁推播）。
- 離線練習（等級 B，仍待決策）。

## 風險與測試（TDD）
- **鎖定畫面洩漏**：內容只含張數；以測試鎖定 payload 的欄位與文字樣板。
- **重複／過度通知**：日界去重、今天已練習跳過、無到期不發——各一個測試，含「cron 連跑兩次只發一次」。
- **cron 被外人呼叫**：無密鑰／錯誤密鑰一律 401，且不查資料庫；proxy matcher 測試覆蓋。
- **web-push 失敗**：404／410 刪除訂閱；5xx／網路錯誤保留並記 log；單一失敗不影響其他人。
- **SW 寫壞**：沿用 Change 51 的 SW 單元測試與變異驗證，新增 push（含壞 payload 仍顯示通知）、notificationclick（白名單、非法網址不開）。
- **iOS 限制**：偵測「在 iOS 瀏覽器且未安裝」顯示「請先加到主畫面」提示，不誤導成壞掉。
- 單元：用例（假 clock＋記憶體 repo＋假 sender）；整合（需 DB）：repository、到期數計數；路由：授權、驗證輸入（endpoint 必須是 https）、重複訂閱冪等；前端：各狀態 UI 與 i18n。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。
- **限制（誠實說明）**：雲端開發環境連不到 Google／Apple 推播服務，**無法在這裡做真的推播端到端測試**。自動測試涵蓋到「呼叫 sender 的內容正確」為止；真機收到通知屬部署後人工驗證。

## 部署後待辦（不屬程式範圍）
- 執行 `npx web-push generate-vapid-keys`，在 Vercel 設定 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`（`mailto:` 你的信箱）與 `CRON_SECRET`。
- 私鑰一旦外洩或更換，所有既有訂閱都會失效（需重新開啟）——請妥善保管。
- 用手機（Android Chrome；iPhone 需先加到主畫面）開啟提醒，手動觸發一次 cron 確認收到通知。

## 待你決定
1. **發送時間** Brisbane 16:00 是否合適？（司機下班後；也可改早上班前。）
2. 你的 Vercel 是 **Hobby 還是 Pro**？Pro 才能做「每人自選時間」，決定是否列入下一個 change。
3. 「今天已練習就不再提醒」是否接受（建議接受，減少打擾）。
4. 接受新增 `web-push` 相依？
