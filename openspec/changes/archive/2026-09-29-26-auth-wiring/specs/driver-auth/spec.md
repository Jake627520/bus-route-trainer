# Spec: driver-auth（Change 26 認證接線）

## ADDED Requirements

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
