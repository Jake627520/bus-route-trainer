# Tasks: 25-auth-foundation

> TDD（先紅後綠）。後端整合測試打真 DB（afterAll 自清）。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 25.1: 雜湊 + session token（純 crypto）
- [x] Task 1: `hashPassword`/`verifyPassword`（scrypt+salt+timingSafeEqual）測試 + 實作 <!-- id: 25-01 -->
- [x] Task 2: `signSession`/`verifySession`（HMAC + exp + 竄改/過期）測試 + 實作 <!-- id: 25-02 -->

## Phase 25.2: schema + repository + use-cases
- [x] Task 3: Prisma `Driver` model + migration <!-- id: 25-03 -->
- [x] Task 4: `DriverAccountRepository` port + Prisma adapter（findByUsername / create）整合測試 + 實作 <!-- id: 25-04 -->
- [x] Task 5: `RegisterDriverUseCase`（雜湊、重複 username→衝突）、`AuthenticateDriverUseCase`（驗證→driver/null）測試 + 實作 <!-- id: 25-05 -->

## Phase 25.3: API + helper + 登入頁
- [ ] Task 6: `POST /api/auth/register`（201 / 409 重複 / 400 缺欄）整合測試 + 實作 <!-- id: 25-06 -->
- [ ] Task 7: `POST /api/auth/login`（成功設 httpOnly cookie / 401 錯誤）、`POST /api/auth/logout`（清 cookie）測試 + 實作 <!-- id: 25-07 -->
- [ ] Task 8: `resolveDriverId(request)`（有效 session→driverId、否則 DEFAULT_DRIVER_ID）測試 + 實作 <!-- id: 25-08 -->
- [ ] Task 9: `/login` 頁（登入 + 註冊表單、mock fetch）測試 + 實作 <!-- id: 25-09 -->

## Phase 25.4: 守門與收尾
- [ ] Task 10: 全套守門（lint + test + build 全綠；不破壞既有 591）<!-- id: 25-10 -->
- [ ] Task 11: 建 `specs/` spec；`openspec archive 25-auth-foundation`；開 PR <!-- id: 25-11 -->

## 注意
- 密碼用 scrypt、cookie 用 HMAC 簽章（`AUTH_SECRET` 環境變數，測試用固定值）；不加第三方依賴。
- 本 change 不改各業務 endpoint（仍 DEFAULT_DRIVER_ID）；resolveDriverId 提供 session→driverId、否則後備常數。
- Driver 表獨立、不動既有 soft-ref driverId。
