# Spec: i18n（Change 32 recall 練習頁雙語）

## ADDED Requirements

### Requirement: recall 練習頁雙語
系統 SHALL 讓 recall 練習頁（`/practice/recall`）所有使用者可見字串依語言顯示，含各狀態（開始表單、載入、無卡片、作答、送出失敗、回饋、完成、放棄、錯誤、放棄確認 Modal）。

#### Scenario: 切換語言
- **WHEN** 在 recall 頁切換語言
- **THEN** 標題/副標、表單 label/placeholder、作答提示與按鈕、各狀態訊息、放棄 Modal 文案即時改用該語言，無另一語言殘留

#### Scenario: 作答模式文案
- **WHEN** 題目為「下一站預測」或「站名辨識」模式
- **THEN** 對應的模式標籤與輸入框 label 以該語言顯示

## 備註
- 伺服器/用戶端技術錯誤碼與訊息（error.code / error.message）維持原樣，不在翻譯範圍。
- 日期相對時間（`formatDistanceToNow`）在地化仍待後續。
- 至此全站（登入、首頁、儀表板、路線頁、recall 練習頁）達成 en/zh-TW 雙語。
