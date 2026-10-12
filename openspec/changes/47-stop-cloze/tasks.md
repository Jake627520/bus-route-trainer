# Tasks: 47-stop-cloze

> TDD。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 47.1: 領域
- [x] Task 1: `parseStopName` 新增 `platform`（`..., platform 1` → `platform: '1'`，stopNumber 仍為 null） <!-- id: 47-01 -->
- [x] Task 2: `buildClozeQuestion(name)` 純函式（platform 遮月台 / 遮關鍵字 / 單字給首字母），提示永不含答案 <!-- id: 47-02 -->
- [x] Task 3: `RecallMode.WORD_CLOZE_RECALL`；`buildStopQuestion` 的兩個退路改走填空 <!-- id: 47-03 -->
- [x] Task 4: 評分：`WORD_CLOZE_RECALL` 走寬鬆站名比對 <!-- id: 47-04 -->

## Phase 47.2: 資料與介面
- [x] Task 5: Prisma enum + migration <!-- id: 47-05 -->
- [x] Task 6: client 型別、練習頁標籤、i18n（en / zh-TW） <!-- id: 47-06 -->

## Phase 47.3: 收尾
- [ ] Task 7: 守門（本機可跑部分 + build 已綠；整合測試待 CI）；archive；PR <!-- id: 47-07 -->
