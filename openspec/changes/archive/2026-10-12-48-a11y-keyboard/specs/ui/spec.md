# Spec: ui（Change 48 無障礙與鍵盤操作）

## ADDED Requirements

### Requirement: 快捷鍵不得搶走元件自己的操作
練習頁「回饋」畫面的 Enter / Space 快捷鍵 SHALL 只在焦點位於頁面本體時進下一題；焦點在按鈕、連結、輸入框等可操作元素時 MUST NOT 攔截；帶 Ctrl/Alt/Meta/Shift 的組合鍵一律忽略。

#### Scenario: 焦點在「放棄」按鈕
- **WHEN** 回饋畫面中焦點在「放棄」按鈕並按 Enter
- **THEN** 執行放棄，而不是進下一題

### Requirement: 對話框焦點管理
Modal SHALL 在開啟時把焦點移進對話框、將 Tab / Shift+Tab 圈限在對話框內、關閉後還原到開啟前的元素；父元件重新 render 時不得重新搶焦點。

### Requirement: 螢幕閱讀器播報
練習頁 SHALL 有常駐的 `role="status"` 播報區，在答題後念出答對／答錯與（答錯時的）正確答案；題目提示 SHALL 以 `aria-describedby` 關聯輸入框，且提示中的底線讀成「空格／blank」；回饋畫面 SHALL 把焦點移到「下一題」按鈕；錯誤區塊 SHALL 為 `role="alert"`；裝飾 emoji SHALL `aria-hidden`。

### Requirement: 鍵盤導覽輔助
系統 SHALL 提供「跳到主要內容」連結（各頁 `<main id="main-content">`）、全域 `:focus-visible` 焦點樣式（深色模式使用高對比顏色）、不重複的表單控制項 id、帶 `lang` 的語言切換按鈕。
