# Tasks: 30-i18n

> TDD。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 30.1: 基建
- [x] Task 1: `config` + `resolveLocale`（cookie → Accept-Language → en） <!-- id: 30-01 -->
- [x] Task 2: `messages`（zh-TW/en）+ `createT`（key + {param} 插值，缺 key 回 key） <!-- id: 30-02 -->
- [x] Task 3: `LocaleProvider` + `useT`（無 Provider 預設 zh-TW） <!-- id: 30-03 -->
- [x] Task 4: `LanguageSwitcher`（寫 cookie + refresh） <!-- id: 30-04 -->
- [x] Task 5: root layout async：解析 locale、`<html lang>`、掛 Provider + Switcher <!-- id: 30-05 -->

## Phase 30.2: 套用
- [x] Task 6: 登入頁字串改 `t()` <!-- id: 30-06 -->
- [x] Task 7: 首頁標題與區塊標題改 `t()` <!-- id: 30-07 -->

## Phase 30.3: 收尾
- [ ] Task 8: 守門三綠；更新 HANDOFF.md；archive <!-- id: 30-08 -->
