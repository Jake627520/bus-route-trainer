# Tasks: 52-daily-review-push

> TDD。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。
> 開工前須通過人審（見 proposal.md「待你決定」）。

## Phase 52.1: 核心邏輯
- [ ] Task 1: 提醒設定常數（發送時間、批次大小、上限）+ 通知內容樣板（en／zh-TW，只含張數）+ `PushSender`、`PushSubscriptionRepository`、`DueCountQuery` port <!-- id: 52-01 -->
- [ ] Task 2: `SubscribeToPush`／`UnsubscribeFromPush`（驗證 endpoint 為 https、重複訂閱冪等、同 endpoint 換帳號時轉移） <!-- id: 52-02 -->
- [ ] Task 3: `SendDailyReviewReminders`（無到期不發／日界去重／今天已練習跳過／404·410 清除／其他錯誤保留並記 log／單點失敗不影響他人／批次與上限） <!-- id: 52-03 -->

## Phase 52.2: 資料庫與基礎設施
- [ ] Task 4: Prisma `push_subscription` + migration <!-- id: 52-04 -->
- [ ] Task 5: `PrismaPushSubscriptionRepository` 與每位司機到期卡片數計數查詢（整合測試） <!-- id: 52-05 -->
- [ ] Task 6: `WebPushSender`（`web-push`；缺環境變數時為停用狀態） <!-- id: 52-06 -->

## Phase 52.3: API
- [ ] Task 7: `POST /api/push/subscribe`、`/unsubscribe`（需登入、輸入驗證、冪等） <!-- id: 52-07 -->
- [ ] Task 8: `GET /api/cron/review-reminders`（Bearer 密鑰、定時比較、無密鑰不查 DB、未設定回 skipped）+ `vercel.json` cron + `src/proxy.ts` 例外與 matcher 測試 <!-- id: 52-08 -->

## Phase 52.4: Service worker
- [ ] Task 9: `sw.js` 加 `push`（壞 payload 仍顯示通用通知）與 `notificationclick`（同網域白名單）；VERSION → v2；變異驗證 <!-- id: 52-09 -->

## Phase 52.5: 前端
- [ ] Task 10: `PushReminderToggle`（不支援／iOS 需加到主畫面／已拒絕／可開啟／已開啟）+ 與 `ReviewNotifier` 整併 + i18n <!-- id: 52-10 -->
- [ ] Task 11: 登出時取消本機訂閱（best-effort） <!-- id: 52-11 -->

## Phase 52.6: 收尾
- [ ] Task 12: 守門三綠；真瀏覽器驗證（訂閱流程、SW push 事件以模擬事件測）；更新 spec／HANDOFF／DEPLOY（VAPID、環境變數、人工驗證）；archive；PR <!-- id: 52-12 -->

## 部署後待辦（合併上線後才能做，不屬於本 change 的程式範圍）
- [ ] 產生 VAPID 金鑰並在 Vercel 設環境變數
- [ ] 手機實機收到通知（Android Chrome；iPhone 需先加到主畫面）
