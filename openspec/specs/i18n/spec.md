# i18n Specification

## Purpose
TBD - created by archiving change 30-i18n-foundation. Update Purpose after archive.

## Requirements

### Requirement: 語言偵測
系統 SHALL 以「有效的 cookie 明確選擇 > Accept-Language > 預設 en」決定介面語言，支援 `en` 與 `zh-TW`。

#### Scenario: cookie 優先
- **WHEN** 請求帶有效的 `brt_locale` cookie
- **THEN** 使用該語言，忽略 Accept-Language

#### Scenario: 依瀏覽器偵測
- **WHEN** 無 cookie，Accept-Language 以 `zh` 開頭
- **THEN** 使用 `zh-TW`；其餘語言 → `en`（預設）

### Requirement: 翻譯查找與回退
系統 SHALL 提供 `createT(locale)` → `t(key, vars?)`：巢狀 key 查找、`{var}` 內插、缺 key 時回退 en 再回退 key 字串。

#### Scenario: 查找與內插
- **WHEN** `createT('zh-TW')('auth.signedInAs', { name: 'alice' })`
- **THEN** 回傳 `司機 alice`

#### Scenario: 缺 key 回退
- **WHEN** 查找兩語言都沒有的 key
- **THEN** 回傳 key 字串本身（不讓整頁崩）

### Requirement: 語言切換
系統 SHALL 提供語言切換，寫 `brt_locale` cookie 並重新整理，由 server 重解析套用新語言。

#### Scenario: 切換語言
- **WHEN** 使用者點選另一語言
- **THEN** 寫入 cookie、`router.refresh()`，頁面以新語言重新渲染

### Requirement: 登入頁與首頁 shell 雙語
系統 SHALL 讓 `/login` 全部字串、首頁標題/副標/區塊標題、AuthStatus 依語言顯示。

#### Scenario: 首頁 shell 切語言
- **WHEN** 在首頁切換語言
- **THEN** 標題/副標/區塊標題（待複習/精熟度趨勢/所有路線）即時改用該語言

> 備註：其餘元件內文（RouteList、ReviewDashboard、各 stat 等）之翻譯留後續 change；本 change 允許 shell 已譯、子元件未譯的混用狀態。

### Requirement: 首頁子元件雙語
系統 SHALL 讓首頁所有子元件（route-list、review-dashboard、review-reminder、review-notifier、streak-stat、accuracy-stat、batch-practice-button、mastery-trend）依語言顯示。

#### Scenario: 切換語言
- **WHEN** 在首頁切換語言
- **THEN** 上述元件的文字（載入/空狀態/數據標籤/按鈕/通知）即時改用該語言，英語模式下無中文殘留

### Requirement: 路線相關頁面雙語
系統 SHALL 讓路線詳情頁與 variant 列表（含方向標籤去程/返程、報名狀態）依語言顯示。

#### Scenario: 方向與狀態標籤
- **WHEN** 以某語言檢視 variant 列表
- **THEN** 方向（去程/返程/方向 N）與報名狀態（未報名/學習中/已精熟等）以該語言顯示

### Requirement: recall 頁無中文殘留
系統 SHALL 讓 recall 練習頁的批次相關字串（批次進度/全部完成/下一條路線/載入中）依語言顯示。

#### Scenario: 英語模式
- **WHEN** 語言為 en
- **THEN** recall 頁批次字串顯示英文（該頁其餘既有英文 UI 之 zh-TW 翻譯留 recall 專屬 change）

### Requirement: recall 練習頁雙語
系統 SHALL 讓 recall 練習頁（`/practice/recall`）所有使用者可見字串依語言顯示，含各狀態（開始表單、載入、無卡片、作答、送出失敗、回饋、完成、放棄、錯誤、放棄確認 Modal）。

#### Scenario: 切換語言
- **WHEN** 在 recall 頁切換語言
- **THEN** 標題/副標、表單 label/placeholder、作答提示與按鈕、各狀態訊息、放棄 Modal 文案即時改用該語言，無另一語言殘留

#### Scenario: 作答模式文案
- **WHEN** 題目為「下一站預測」或「站名辨識」模式
- **THEN** 對應的模式標籤與輸入框 label 以該語言顯示

### Requirement: 以澳洲（Brisbane）時區決定日界
系統 SHALL 以 `Australia/Brisbane`（UTC+10）決定所有「以日為單位」的計算（streak、精熟度趨勢、attempt 日期分組），不使用 UTC 日界。

#### Scenario: 清晨練習計入當地當天
- **WHEN** 司機在 Brisbane 當地清晨（對應前一 UTC 日）完成練習
- **THEN** streak 與趨勢將其計入 Brisbane 當天，而非 UTC 前一天

### Requirement: 相對時間在地化
系統 SHALL 讓複習時間的相對顯示（formatDistanceToNow）依 UI 語言顯示（zh-TW / en）。

#### Scenario: 切語言
- **WHEN** 以 zh-TW 檢視複習儀表板
- **THEN** 「下次複習」的相對時間以中文顯示
