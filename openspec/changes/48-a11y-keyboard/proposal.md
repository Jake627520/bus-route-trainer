# Proposal: 48-a11y-keyboard

狀態：`proposed`
編號：48。可與 Change 47 並行（互不依賴）。

## Why
稽核現況（螢幕閱讀器與純鍵盤操作）發現具體缺口，司機在車上/戶外常用手機輔助功能或外接鍵盤，這些會直接卡住操作：

1. **鍵盤快捷鍵會搶操作**：練習頁在「回饋」畫面用 `window` 監聽 Enter / Space 直接下一題。焦點在「放棄」按鈕時按 Enter，結果是跳下一題而不是放棄。
2. **焦點遺失**：送出答案後輸入框消失，焦點掉回 `<body>`；螢幕閱讀器使用者不知道發生什麼事。
3. **題目沒被念出**：提示（如 `Freesia St at ______`）沒有和輸入框關聯；底線會被念成一串「底線」。結果（答對/答錯/正確答案）的 `aria-live` 區塊是「出現時才掛上」，多數螢幕閱讀器不會播報。
4. **Modal 沒有焦點管理**：開啟時焦點不進對話框、Tab 會跑到背後頁面、關閉後不還原焦點。
5. **沒有「跳到主內容」連結**：每頁一開始都要先 Tab 過語言切換。
6. **雜項**：裝飾 emoji（✅❌⚠️🚫）被念出重複內容；錯誤區塊沒有 `role="alert"`；`TextInput` 的 id 由 label 文字推導，同名會重複；語言切換按鈕沒有 `lang`；沒有全域的鍵盤焦點樣式備援。

## What Changes
- `Modal`：開啟時焦點移進對話框、Tab 焦點圈限、Esc 關閉（已有）、關閉後還原焦點。
- `useAdvanceShortcut` hook（取代練習頁內的 window 監聽）：只在焦點位於頁面本體（非按鈕/連結/輸入）時，Enter/Space 才下一題；忽略組合鍵。
- 練習頁：回饋畫面把焦點移到「下一題」按鈕；常駐的 `role="status"` 播報區念出「答對/答錯＋正確答案」；提示以 `aria-describedby` 關聯到輸入框，底線換成「空格」讀法；error/submit-failed 加 `role="alert"`；裝飾 emoji `aria-hidden`。
- `SkipLink` 元件 + 各頁 `<main id="main-content">`。
- `TextInput` 用 `useId` 當 id 備援。
- 語言切換按鈕加 `lang`。
- `globals.css`：`:focus-visible` 全域備援樣式。
- i18n（en / zh-TW）：新增 `a11y.*` 字串。

## Non-goals
- 不做完整 WCAG 色彩對比稽核（需要真實瀏覽器 + 工具，另開 change）。
- 不改視覺設計。
- 不引入新套件。

## 風險與測試（TDD）
- 元件/hook 測試（Testing Library + jsdom）：Modal 焦點進入/圈限/還原；快捷鍵只在 body 焦點生效；SkipLink；播報區；TextInput id 唯一。
- 練習頁本身沒有既有測試，且需要 session 後端；焦點移動等整頁行為無法在本環境於真瀏覽器驗證，會在 PR 說明。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。
