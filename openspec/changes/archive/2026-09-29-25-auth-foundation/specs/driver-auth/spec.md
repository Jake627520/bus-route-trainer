# Spec: driver-auth（Change 25 認證基礎）

## ADDED Requirements

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
