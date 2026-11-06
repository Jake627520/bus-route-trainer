# Spec: pwa（可安裝、離線不白屏、每日複習提醒，Change 51／52）

## Requirements

### Requirement: 可安裝
系統 SHALL 提供 Web App Manifest（`display: standalone`、`start_url: /`、品牌色、192／512／maskable 圖示），使瀏覽器可將其加入主畫面並以獨立視窗開啟。manifest、圖示、`/sw.js`、`/offline.html` MUST 不需登入即可取得。

### Requirement: 離線時顯示離線頁而非瀏覽器錯誤
頁面導覽在連不上網路時，系統 SHALL 顯示預先快取的離線頁（依瀏覽器語言顯示中文或英文，含重試鈕），且離線頁 MUST NOT 依賴任何外部資源。

#### Scenario: 離線時開啟網站
- **WHEN** 裝置離線並導覽到任一頁面
- **THEN** 顯示離線頁，而不是瀏覽器的無法連線畫面

### Requirement: 不快取個人資料
Service worker MUST NOT 快取 `/api/*` 的回應，亦 MUST NOT 快取需登入頁面的 HTML；僅快取離線頁與不可變的靜態資源（含雜湊檔名）。非 GET、跨網域請求 MUST 不攔截。

### Requirement: Service worker 故障時不得擋住網站
Service worker 處理請求出錯時 SHALL 放行至網路；其腳本檔 MUST 以 `Cache-Control: no-cache, no-store, must-revalidate` 提供，使修正版能立即生效。

### Requirement: 離線狀態提示
裝置離線時，畫面 SHALL 顯示 `role="status"` 的離線提示（en／zh-TW），恢復連線後消失。

### Requirement: 恢復連線後自動補送答案
練習中送出答案失敗而進入重試狀態時，裝置恢復連線後系統 SHALL 自動重送同一份答案一次，且 MUST NOT 造成重複計分。

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
`GET /api/cron/review-reminders` MUST 要求正確的 `Authorization: Bearer` 密鑰，否則回 401 且不存取資料庫；伺服器未設定密鑰時亦 MUST 回 401（不得因密鑰為空而放行）。通過驗證後若未設定推播金鑰，SHALL 回 200 並略過、不影響其他功能。

### Requirement: 失效訂閱自動清除
推播服務回 404 或 410 時，系統 SHALL 刪除該訂閱；其他錯誤 SHALL 保留訂閱並記錄，且單一訂閱的失敗 MUST NOT 影響其他訂閱的發送。

### Requirement: Service worker 處理推播
Service worker SHALL 在收到 push 時一律顯示通知（即使內容無法解析，顯示通用文字），並在點擊通知時僅開啟同網域的路徑，MUST NOT 開啟外部網址。
