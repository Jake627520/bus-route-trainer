# Proposal: 30-i18n-foundation

狀態：`proposed`
編號：30。

## Why

UI 目前全硬編繁體中文，但真實用戶是 Brisbane 的英語公車司機；開發者本人用 zh-TW。需要雙語（en / zh-TW）介面。使用者定案：**輕量自建（無額外依賴）、依瀏覽器自動偵測（en 後備）、首個 change 先做基建 + 登入頁 + 首頁**，其餘元件後續再擴。

## 技術決策（鎖定）

1. **輕量自建、無依賴**（符合專案慣例：scrypt 自建、inline SVG）。不加 next-intl。
2. **語言**：`en`（預設/後備）、`zh-TW`。偵測順序：cookie `brt_locale` 明確選擇 > `Accept-Language`（`zh*`→zh-TW，其餘→en）。
3. **訊息字典**：`src/i18n/messages.ts` 以型別化物件存兩語；`createT(locale)` 回 `t(key, vars?)`（巢狀 key 查找 + `{var}` 內插 + 找不到時回退 en 再回退 key）。
4. **server/client 共用**：root `layout.tsx`（server）用 `resolveLocale` 解析語言 → 傳給 client `LocaleProvider`（context）。client 元件用 `useT()`；server 元件用 `getDictionary(locale)`。
5. **切換**：`LanguageSwitcher`（client）寫 cookie `brt_locale` + `router.refresh()`，server 重解析套新語言。

## What Changes（Change 30 範圍）

- **i18n 基建**：`src/i18n/config.ts`（Locale/常數）、`messages.ts`（en/zh-TW 字典）、`resolve.ts`（`resolveLocale` 純函式）、`t.ts`（`createT`/`t` 純函式）。
- **Provider/Switcher**：`LocaleProvider`、`useT` hook、`LanguageSwitcher`。
- **套用**：登入頁（`/login`）全部字串、首頁 shell（`page.tsx` 標題/副標/區塊標題）、`AuthStatus`。
- **layout**：解析 locale、設 `<html lang>`、掛 Provider + Switcher。

## Non-goals（留後續 change）
- 其餘元件內文（RouteList、ReviewDashboard、MasteryTrend、StreakStat、AccuracyStat、BatchPracticeButton、ReviewNotifier/Reminder、VariantList、recall 練習頁）字串——下一個 i18n change 擴充。
- 日期/數字 in-locale 格式化、複數規則（目前字串無此需求）。
- URL 路徑式 locale（/en、/zh-TW）——用 cookie 式即可，內部工具不需 SEO。

## 風險與測試（TDD）
- `resolveLocale`：cookie 優先；無 cookie 時 Accept-Language `zh-TW,zh;q=0.9`→zh-TW、`en-AU`→en、空→en。
- `createT`：巢狀 key 查找、`{name}` 內插、缺 key 回退 en、en 也缺回退 key 字串。
- 登入頁測試沿用既有（文案改用 t()，測試改以 key 對應語言斷言或放寬 matcher）。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。不破壞既有測試。
