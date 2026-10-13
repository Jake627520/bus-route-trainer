# Spec: driver-auth（Change 49 認證端點限流）

## ADDED Requirements

### Requirement: 登入嘗試次數限制
系統 SHALL 限制 `POST /api/auth/login`：同一 IP 15 分鐘內最多 30 次；同一帳號 15 分鐘內最多 5 次**失敗**。超過時回 HTTP 429、`Retry-After` 標頭與 `{ error: { code: 'RATE_LIMITED' } }`。登入成功 SHALL 清除該帳號的失敗計數。鎖定 MUST 是暫時的（時間窗結束即解除）。

#### Scenario: 連續失敗達上限
- **WHEN** 同一帳號 15 分鐘內第 6 次登入失敗
- **THEN** 回 429，即使這次密碼正確也先被擋，直到時間窗結束

#### Scenario: 成功登入清除失敗計數
- **WHEN** 同一帳號先失敗 3 次後成功登入
- **THEN** 失敗計數歸零

### Requirement: 註冊與重設限流
系統 SHALL 限制 `POST /api/auth/register` 每 IP 每小時 10 次、`POST /api/auth/reset` 每 IP 每小時 20 次；超過回 429。

### Requirement: 忘記密碼限流且不洩漏帳號
系統 SHALL 限制 `POST /api/auth/forgot` 每 IP 每小時 10 次（超過回 429），並限制同一 email 每小時 3 封。同一 email 超限時 MUST 仍回 200 且不寄信，使回應無法用來判斷該 email 是否存在。

### Requirement: 取不到 IP 時保守處理
系統 SHALL 在取不到用戶端 IP 時使用共用 key `unknown` 計數，MUST NOT 因此放行。

### Requirement: 限流元件故障時不阻擋認證
限流資料庫操作失敗時，系統 SHALL 記錄錯誤並放行（fail-open）。

### Requirement: 前端顯示限流訊息
登入、忘記密碼、重設密碼頁 SHALL 依 `RATE_LIMITED` 顯示在地化訊息，並包含需等待的分鐘數。
