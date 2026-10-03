# Spec: i18n（Change 31 元件雙語化）

## ADDED Requirements

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
