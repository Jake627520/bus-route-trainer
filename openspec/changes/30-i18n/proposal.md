# Proposal: 30-i18n

狀態：`proposed`
編號：30。依賴 Change 29 已合入 main。

## Why
全站字串目前硬編繁中。要支援英文（及未來其他語言），先建一套輕量 i18n 基建，並把「登入頁 + 首頁」改成可翻譯，作為樣板。

## What Changes
- **輕量自建，不裝套件**：`src/i18n/`（config、resolveLocale、messages、createT）。
- **語言決定順序**：`locale` cookie（使用者手動選）→ `Accept-Language` 瀏覽器偵測 → 後備 `en`。
- 支援語言：`zh-TW`、`en`。
- `LocaleProvider` + `useT()`（client）；沒有 Provider 時預設 `zh-TW`（既有測試不必改）。
- `LanguageSwitcher`：切換時寫 cookie 並 `router.refresh()`。
- root layout 改 async：解析 locale、設 `<html lang>`、掛 Provider + Switcher。
- 翻譯範圍：登入頁、首頁（標題、區塊標題）。

## Non-goals
- 其他頁面（練習、路線詳情、各 component 內字串）——後續 change 逐步搬。
- 複數、日期/數字格式化、URL 前綴路由（/en/...）。
- API 錯誤訊息翻譯（目前由後端回傳）。

## 風險與測試（TDD）
- 純函式（resolveLocale、createT）單元測試。
- 元件測試：Provider/useT、Switcher 寫 cookie。
- 既有 login/home 測試維持綠（預設 zh-TW）；新增 en 斷言。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。
