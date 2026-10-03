# Tasks: 30-i18n-foundation

> TDD。輕量自建無依賴；en 預設/後備、cookie > Accept-Language 偵測。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 30.1: i18n 純函式基建（TDD）
- [x] Task 1: `config.ts`（Locale/LOCALES/DEFAULT_LOCALE/LOCALE_COOKIE）+ `resolve.ts`（`resolveLocale(acceptLanguage, cookieLocale)`）測試 + 實作 <!-- id: 30-01 -->
- [x] Task 2: `messages.ts`（en/zh-TW 字典，型別化）+ `t.ts`（`createT`/巢狀查找/內插/回退）測試 + 實作 <!-- id: 30-02 -->

## Phase 30.2: Provider / Switcher
- [x] Task 3: `LocaleProvider` + `useT` hook（client context）測試 + 實作 <!-- id: 30-03 -->
- [x] Task 4: `LanguageSwitcher`（寫 cookie + router.refresh）測試 + 實作 <!-- id: 30-04 -->

## Phase 30.3: 套用登入頁 + 首頁 shell
- [x] Task 5: `layout.tsx` 解析 locale、設 `<html lang>`、掛 Provider + Switcher <!-- id: 30-05 -->
- [x] Task 6: 登入頁全部字串改 t()；測試更新 <!-- id: 30-06 -->
- [x] Task 7: 首頁 shell（標題/副標/區塊標題）+ AuthStatus 改 t()；測試更新 <!-- id: 30-07 -->

## Phase 30.4: 守門與收尾
- [x] Task 8: 全套守門（lint + test + build 全綠）<!-- id: 30-08 -->
- [x] Task 9: 建 spec；archive；開 PR、CI 綠 auto-merge；瀏覽器驗證雙語切換 <!-- id: 30-09 -->

## 注意
- 其餘元件內文留下一個 i18n change；本 change 混用（已譯 shell + 未譯子元件）可接受。
- server 元件用 getDictionary(locale)、client 用 useT()，共用同一份 messages。
