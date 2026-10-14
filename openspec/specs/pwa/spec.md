# Spec: pwa（可安裝與離線不白屏，Change 51）

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
