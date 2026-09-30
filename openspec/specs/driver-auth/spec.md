# driver-auth Specification

## Purpose
TBD - created by archiving change 25-auth-foundation. Update Purpose after archive.

## Requirements

### Requirement: 司機帳號註冊
系統 SHALL 允許任何人以 username + password 自助註冊一個 Driver 帳號；username 唯一。

#### Scenario: 成功註冊
- **WHEN** 以未使用過的 username 與長度 ≥4 的 password 呼叫 `POST /api/auth/register`
- **THEN** 回傳 201 與 `{ data: { id, username } }`，且密碼以 scrypt+salt 雜湊儲存（不存明文）

#### Scenario: username 重複
- **WHEN** 以已存在的 username 註冊
- **THEN** 回傳 409 `{ error: { code: 'USERNAME_TAKEN' } }`

#### Scenario: 欄位不合法
- **WHEN** username 或 password 缺漏，或 password 長度 <4
- **THEN** 回傳 400

### Requirement: 司機登入與登出
系統 SHALL 以簽章 httpOnly cookie（HMAC + `AUTH_SECRET`、payload `{ driverId, exp }`）維持 stateless session。

#### Scenario: 登入成功
- **WHEN** 以正確 username/password 呼叫 `POST /api/auth/login`
- **THEN** 回傳 200 `{ data: { id, username } }`，並以 `Set-Cookie` 下發簽章 session cookie（HttpOnly、SameSite=Lax）

#### Scenario: 登入失敗
- **WHEN** username 不存在或密碼錯誤（scrypt + timingSafeEqual 驗證）
- **THEN** 回傳 401 `{ error: { code: 'INVALID_CREDENTIALS' } }`，不下發 cookie

#### Scenario: 登出
- **WHEN** 呼叫 `POST /api/auth/logout`
- **THEN** 回傳 200 並以 `Max-Age=0` 清除 session cookie

### Requirement: driverId 解析（相容 zero-auth）
系統 SHALL 提供 `resolveDriverId(request)`：有有效 session 時回其 driverId，否則回後備常數 `DEFAULT_DRIVER_ID`。

#### Scenario: 有有效 session
- **WHEN** 請求帶有效且未過期的簽章 session cookie
- **THEN** `resolveDriverId` 回傳 cookie 內的 driverId

#### Scenario: 無 / 無效 / 過期 session
- **WHEN** 請求無 cookie，或 cookie 竄改、簽章不符、已過期
- **THEN** `resolveDriverId` 回傳 `DEFAULT_DRIVER_ID`（本 change 各業務 endpoint 仍相容 zero-auth）

### Requirement: 登入頁
系統 SHALL 提供 `/login` 頁，含登入與註冊兩種模式。

#### Scenario: 登入成功導向首頁
- **WHEN** 使用者在登入模式送出正確帳密
- **THEN** 前端 `POST /api/auth/login`，成功後導向 `/`

#### Scenario: 登入失敗顯示錯誤
- **WHEN** 後端回 401
- **THEN** 頁面以 `role="alert"` 顯示錯誤訊息，且不導向

#### Scenario: 切換註冊
- **WHEN** 使用者切換到註冊模式並送出
- **THEN** 前端改打 `POST /api/auth/register`

### Requirement: 資料 API 依登入司機隔離
系統 SHALL 讓各業務 API 以 `resolveDriverId(request)` 解析司機身分：帶有效 session cookie 時用登入司機、否則相容後備 `DEFAULT_DRIVER_ID`。

#### Scenario: 帶 session 的請求取自己的資料
- **WHEN** 請求帶有效 session cookie 呼叫 `review/*` 或 `progress/*` 或 `recall/*` API
- **THEN** 回傳／寫入的資料以 cookie 內的登入司機 driverId 為準（與其他司機隔離）

#### Scenario: 未帶 session 的請求維持相容
- **WHEN** 請求未帶有效 session cookie
- **THEN** 以 `DEFAULT_DRIVER_ID` 處理（zero-auth 相容，行為不變）

#### Scenario: recall API 的 session 為第一等身分
- **WHEN** recall API 請求帶有效 session cookie（即使在 production 且無 trusted gateway）
- **THEN** `resolveAuthenticatedDriver` 回傳 cookie 內的 driverId；URL 帶 `driverId` 仍一律 400

### Requirement: 頁面保護
系統 SHALL 以 Next.js Proxy（`src/proxy.ts`）保護頁面：未登入者訪問受保護頁導向 `/login`，已登入者訪問 `/login` 導回首頁。

#### Scenario: 未登入被導向登入頁
- **WHEN** 未帶有效 session 的訪客請求首頁或練習頁
- **THEN** Proxy 以 redirect 導向 `/login`

#### Scenario: 已登入不再回登入頁
- **WHEN** 已登入者請求 `/login`
- **THEN** Proxy 以 redirect 導回 `/`

#### Scenario: 排除 API 與靜態資源
- **WHEN** 請求 `/api/*`、`/_next/*` 或靜態 metadata 檔
- **THEN** Proxy matcher 不套用（不影響 API 與資源載入）

### Requirement: 目前身分查詢與登出 UI
系統 SHALL 提供 `GET /api/auth/me` 回目前登入司機，並在首頁顯示帳號與登出鈕。

#### Scenario: 查詢目前登入司機
- **WHEN** 帶有效 session cookie 呼叫 `GET /api/auth/me`
- **THEN** 回 200 `{ data: { id, username } }`；未登入回 401

#### Scenario: 首頁顯示帳號與登出
- **WHEN** 已登入者開啟首頁
- **THEN** 顯示登入帳號與登出鈕；點登出呼叫 `POST /api/auth/logout` 後導向 `/login`

### Requirement: 未登入的資料 API 一律拒絕
系統 SHALL 對 review 與 progress 的資料 API，在無有效 session 時回 401 UNAUTHENTICATED，不再退回 `DEFAULT_DRIVER_ID`。

#### Scenario: 帶 session 取自己的資料
- **WHEN** 帶有效 session cookie 呼叫 `review/*`（streak/accuracy/mastery-trend/summary）或 `progress/*`（enroll、[variantKey]）
- **THEN** 以 cookie 內的登入司機處理，回其資料

#### Scenario: 未登入被拒
- **WHEN** 未帶有效 session cookie 呼叫上述任一 API
- **THEN** 回 401 `{ error: { code: 'UNAUTHENTICATED' } }`，不處理、不回 default driver 的資料

### Requirement: use-case driverId 必要
系統 SHALL 讓 `enroll-variant`、`get-variant-progress` use-case 的 `driverId` 為必要參數，不再於缺漏時退回 DEFAULT。

#### Scenario: 呼叫端須提供 driverId
- **WHEN** 呼叫 `EnrollVariantUseCase` / `GetVariantProgressUseCase`
- **THEN** 必須提供 `driverId`（由 API 邊界的 session 解析提供）；缺漏在型別層即為錯誤
