# Spec: pwa（Change 52 每日複習提醒推播）

## ADDED Requirements

### Requirement: 使用者自願開啟、可隨時關閉
系統 SHALL 僅在使用者明確操作後才請求通知權限並建立推播訂閱；使用者 SHALL 能在每台裝置上獨立關閉，關閉即刪除該裝置訂閱。登出時 SHALL 取消本機裝置的訂閱。

### Requirement: 每日提醒只在有需要時發送
系統 SHALL 每天最多對每位訂閱司機發送一則複習提醒，且僅當該司機有到期卡片時發送。同一 Brisbane 日已發過 MUST NOT 再發；司機當日已練習過 SHALL 跳過。

#### Scenario: 同日重複觸發
- **WHEN** 排程在同一 Brisbane 日內被觸發兩次
- **THEN** 每位司機最多只收到一則

#### Scenario: 無到期卡片
- **WHEN** 司機沒有到期卡片
- **THEN** 不發送

### Requirement: 通知內容不洩漏學習內容
推播內容 MUST 僅包含固定樣板與到期張數（依訂閱時的語言 en／zh-TW），MUST NOT 包含站名、路線、題目或答案。

### Requirement: 排程端點僅限持有密鑰者
`GET /api/cron/review-reminders` MUST 要求正確的 `Authorization: Bearer` 密鑰，否則回 401 且不存取資料庫。未設定推播相關環境變數時 SHALL 回 200 並略過、不影響其他功能。

### Requirement: 失效訂閱自動清除
推播服務回 404 或 410 時，系統 SHALL 刪除該訂閱；其他錯誤 SHALL 保留訂閱並記錄，且單一訂閱的失敗 MUST NOT 影響其他訂閱的發送。

### Requirement: Service worker 處理推播
Service worker SHALL 在收到 push 時一律顯示通知（即使內容無法解析，顯示通用文字），並在點擊通知時僅開啟同網域的路徑，MUST NOT 開啟外部網址。
