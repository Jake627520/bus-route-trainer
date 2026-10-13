# Tasks: 50-previous-stop

> TDD。守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 50.1: 領域
- [ ] Task 1: `CardType.PREV_STOP`、`generatePreviousStopCardKey`、鍵解析；卡片產生器為每對相鄰站（寬鬆站名不同者）產生上一站卡 <!-- id: 50-01 -->
- [ ] Task 2: `RecallMode.PREVIOUS_STOP_BACKWARD`；評分走寬鬆站名比對 <!-- id: 50-02 -->

## Phase 50.2: 資料庫與補發
- [ ] Task 3: Prisma enum（`CardType.PREV_STOP`、`RecallMode.PREVIOUS_STOP_BACKWARD`）+ migration <!-- id: 50-03 -->
- [ ] Task 4: `CURRENT_CARDS_VERSION` 1→2；補發只新增 `PREV_STOP` 卡、不動既有卡 <!-- id: 50-04 -->

## Phase 50.3: 出題與批改
- [ ] Task 5: session 出題（給 B 站名）與批改（答案為 A 站名）接上新卡；進度 DTO 投影 `currentSequence` <!-- id: 50-05 -->

## Phase 50.4: 前端
- [ ] Task 6: client 型別、練習頁標籤、i18n（en／zh-TW） <!-- id: 50-06 -->

## Phase 50.5: 收尾
- [ ] Task 7: 守門三綠；真瀏覽器完整流程；更新 spec／HANDOFF；archive；PR <!-- id: 50-07 -->
