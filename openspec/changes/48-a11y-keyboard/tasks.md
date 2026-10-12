# Tasks: 48-a11y-keyboard

> TDD。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 48.1: 共用元件
- [ ] Task 1: `Modal` 焦點管理（進入 / Tab 圈限 / 還原） <!-- id: 48-01 -->
- [ ] Task 2: `TextInput` 用 `useId` 備援 id（同 label 不重複） <!-- id: 48-02 -->
- [ ] Task 3: `SkipLink` + i18n + 各頁 `<main id="main-content">` + layout 掛載 <!-- id: 48-03 -->
- [ ] Task 4: 語言切換按鈕 `lang`；`globals.css` `:focus-visible` 備援 <!-- id: 48-04 -->

## Phase 48.2: 練習頁
- [ ] Task 5: `useAdvanceShortcut` hook（只在焦點在本體時 Enter/Space 下一題） <!-- id: 48-05 -->
- [ ] Task 6: `LiveAnnouncer`（常駐 role=status）+ 練習頁播報答對/答錯/正確答案 <!-- id: 48-06 -->
- [ ] Task 7: 提示 `aria-describedby` + 空格讀法；回饋畫面焦點移到「下一題」；error/failed `role="alert"`；裝飾 emoji `aria-hidden` <!-- id: 48-07 -->

## Phase 48.3: 收尾
- [ ] Task 8: 守門；archive；PR（說明需真瀏覽器/讀屏實測的項目） <!-- id: 48-08 -->
