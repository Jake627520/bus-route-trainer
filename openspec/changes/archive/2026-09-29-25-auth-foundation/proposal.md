# Proposal: 25-auth-foundation

狀態：`proposed`（帳號+密碼，人審機制已定；此提案待使用者確認計畫後實作）
編號：25。

## Why

專案目前 zero-auth：所有人共用常數 `DEFAULT_DRIVER_ID`，無法多司機各自進度、也不能上線給真人用。
使用者選定**自建帳號+密碼**。因認證牽動每個 endpoint 且涉及安全，拆成兩個 change 降低風險：

- **Change 25（本提案）＝認證基礎**：Driver 帳號、註冊/登入/登出、密碼雜湊、session cookie、
  `resolveDriverId(request)` 輔助函式、登入頁。**先不改各業務 endpoint**（仍用 DEFAULT_DRIVER_ID），
  確保可獨立交付、測試全綠。
- **Change 26（後續）＝強制與接線**：所有 endpoint 改用登入司機（`resolveDriverId`）、未登入頁面導向登入、
  移除 DEFAULT_DRIVER_ID 後備。之後才是 Change 27 部署設定。

## 技術決策（鎖定）

1. **密碼雜湊**：Node 內建 `crypto.scrypt` + 隨機 salt（**不加第三方依賴**，符合專案慣例）；
   儲存 `salt` 與 `hash`，驗證用 `timingSafeEqual`。
2. **Session**：**簽章 httpOnly cookie**（`crypto` HMAC + `AUTH_SECRET` 環境變數），payload `{ driverId, exp }`，
   每次請求驗章與過期。無 session 表（stateless）；登出＝清 cookie。
3. **Driver 模型**：`Driver { id(uuid) @id, username @unique, passwordHash, passwordSalt, createdAt }`。
   `driverId` 在既有資料是「soft ref 字串」，故新表獨立、不動既有 FK；登入後以 `Driver.id` 當 driverId。
4. **Zero-auth 相容**：本 change 不移除 DEFAULT_DRIVER_ID；`resolveDriverId(request)` 有 session 回其
   driverId、否則回 DEFAULT_DRIVER_ID（Change 26 才改為強制）。

## What Changes（Change 25 範圍）

- **Schema**：新增 `Driver` model + migration。
- **domain/application**：`PasswordHasher`（scrypt）、`SessionToken`（簽章/驗證）、
  `RegisterDriverUseCase`、`AuthenticateDriverUseCase`、`DriverAccountRepository` port + Prisma adapter。
- **API**：`POST /api/auth/register`、`POST /api/auth/login`（設 cookie）、`POST /api/auth/logout`（清 cookie）；
  錯誤走既有 `{ error: { code, message } }`。
- **輔助**：`resolveDriverId(request)`（讀 cookie 驗章 → driverId，否則 DEFAULT_DRIVER_ID）。
- **UI**：`/login` 頁（登入 + 註冊表單）。

## Non-goals（留給 26 / 之後）
- 改各業務 endpoint 用登入司機、頁面保護、移除 DEFAULT_DRIVER_ID（Change 26）。
- 密碼重設、角色權限、rate limit、部署設定（Change 27）。

## 風險與測試
- 安全關鍵：hash 用 scrypt+salt+timingSafeEqual；cookie 簽章驗證；`AUTH_SECRET` 由環境提供（測試用固定值）。
- 測試（TDD）：hasher（雜湊/驗證/錯密碼）、session token（簽/驗/竄改/過期）、register（重複 username 409）、
  login（成功設 cookie / 錯誤 401）、logout（清 cookie）、resolveDriverId（有/無 session）、/login 頁基本渲染。
- 後端整合測試打真 DB（afterAll 自清）；不破壞既有 591 測試。

## 開放問題（實作前請確認）
1. 同意**拆成 25 基礎 / 26 接線**兩個 change？（避免單一巨無霸、每步可交付。）
2. 同意技術選擇：**scrypt（無新依賴）+ 簽章 cookie（AUTH_SECRET）+ 獨立 Driver 表**？
3. 註冊開放給任何人自助註冊，還是僅登入（帳號另外建）？（傾向：先開放自助註冊，簡單可用。）
