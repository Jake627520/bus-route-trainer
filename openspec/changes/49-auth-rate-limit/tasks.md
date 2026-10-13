# Tasks: 49-auth-rate-limit

> TDD。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。
> 開工前須通過人審（見 proposal.md「待你決定」）。

## Phase 49.1: 核心邏輯
- [x] Task 1: 限流設定檔（各端點的次數／時間窗）+ `RateLimitRepository` port <!-- id: 49-01 -->
- [x] Task 2: `CheckRateLimit`（假 clock + 記憶體 repo 測：窗內累加／跨窗歸零／超限回 retryAfter／清除失敗計數） <!-- id: 49-02 -->
- [x] Task 3: `getClientIp(request)`（x-forwarded-for 第一個值；缺失回 `unknown`） <!-- id: 49-03 -->

## Phase 49.2: 資料庫
- [x] Task 4: Prisma `auth_rate_limit` + migration <!-- id: 49-04 -->
- [x] Task 5: `PrismaRateLimitRepository`（原子 upsert 遞增、過期清理；整合測試含並發） <!-- id: 49-05 -->

## Phase 49.3: 接上路由
- [x] Task 6: login（每 IP + 每帳號失敗計數；成功清除）→ 429 + `Retry-After` <!-- id: 49-06 -->
- [x] Task 7: register、reset（每 IP） <!-- id: 49-07 -->
- [x] Task 8: forgot（每 IP 429；每 email 超限靜默 200 且不寄信） <!-- id: 49-08 -->
- [x] Task 9: 限流元件故障時 fail-open（記 log） <!-- id: 49-09 -->

## Phase 49.4: 前端
- [x] Task 10: 登入／忘記密碼／重設密碼頁處理 `RATE_LIMITED`，i18n（en／zh-TW，含分鐘數） <!-- id: 49-10 -->

## Phase 49.5: 收尾
- [ ] Task 11: 守門三綠；部署後用真實請求驗證 IP header；更新 spec；archive；PR <!-- id: 49-11 -->
