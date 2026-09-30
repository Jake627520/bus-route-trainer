# Spec: driver-auth（Change 29 強制認證）

## ADDED Requirements

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

## 備註
- recall 路徑（`resolveAuthenticatedDriver`）在 production 早已強制 401（無 session/gateway 即 throw），本 change 不變更；其 test/dev 的 `x-authenticated-driver-id` seam 與 DEFAULT 僅為測試基建，永不服務真實用戶。
- `DEFAULT_DRIVER_ID` 常數保留為測試 seed 用的已知 driverId。
