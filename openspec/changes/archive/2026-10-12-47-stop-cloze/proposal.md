# Proposal: 47-stop-cloze

狀態：`proposed`
編號：47。依賴 Change 45/46 已合入 main。

## Why
Change 45 之後，約 9.2% 的站（車站類，如 `Cultural Centre Station`、`Griffith University station, platform 1`）沒有路口也沒有站號，仍退回「辨識站名」：提示與答案是**同一個站名**，司機只要照抄就會對，沒有任何記憶訓練效果（等於把答案寫在題目上）。

## What Changes
- 新題型 **`WORD_CLOZE_RECALL`（單字填空）**，取代上述退路：
  - 站名含 `platform N` → 遮住月台號：`Griffith University station, platform ______`，答 `1`。
  - 其餘 → 遮住最有辨識度的一個字（最長、且不是 station/platform/busway/interchange/terminal 這類通用字；同長取第一個）：`Cultural ______ Station`，答 `Centre`。
  - 單字站名（無可遮的詞）→ 只給首字母與字數：`C________`，答完整站名。
- `buildStopQuestion` 是出題與批改共用的唯一推導；新規則也在這裡，**提示永不含答案**（測試保證）。
- STOP_NUM 卡在站名沒有站號時，也走同一個填空，不再退回辨識站名。
- `parseStopName` 新增 `platform` 欄位（platform 仍不算 stop number）。
- Prisma enum 新增 `WORD_CLOZE_RECALL`（migration）；評分走寬鬆站名比對；練習頁與 i18n（en / zh-TW）新增標籤。

## Non-goals
- 不改既有 `NEXT_STOP_FORWARD` / 路口填空 / 站號題。
- 不移除舊 `STOP_NAME_RECOGNITION` 列舉值（歷史 attempt 仍引用）。
- 不做模糊比對、不給部分分數。

## 風險與測試（TDD）
- 純函式測試（`stop-question`、`stop-name`）：各種站名 → 題型/提示/答案；**提示不含答案** 的性質測試。
- 評分測試：寬鬆比對 `centre` / `Centre.`；月台 `1` / `Platform 1`（lenient 去掉 stop 後綴規則不得誤傷）。
- 無 DB 環境只能跑純函式與前端測試；整合測試交給 CI。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。
