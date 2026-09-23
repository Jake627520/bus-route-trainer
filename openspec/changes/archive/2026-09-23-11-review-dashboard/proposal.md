# Proposal: 11-review-dashboard

狀態：`proposed`（等人審通過後進入實作）
編號：跳過 07（歷史上 srs-scheduling 與 route-browsing-ui 撞號），直接用 11。

## Why

後端 SRS 排程已完成（`schedule-review`、`is-card-due`、`srs-interval-policy`、
`DueLearningCardsQueryPort`、`PlanRecallSessionUseCase`），Change 07 的路線瀏覽前端
也讓司機能報名 variant。但**司機報名後，沒有任何畫面告訴他「現在有哪些 variant 有卡片到期該複習、各有幾張、下次複習時間」**——複習到期資料只活在 domain/application 層，沒有 HTTP API，前端也沒有彙總視圖。

Change 11 交付**複習到期視覺化**：一條完整 vertical slice（新增 HTTP API + 前端儀表板），
讓司機一眼看到自己的複習負荷並一鍵開始練習。

## What Changes

### 1. 後端：複習彙總 API（新增）
- 新增 `GET /api/review/summary` → `{ data: VariantReviewSummary[] }`。
- `VariantReviewSummary` 每筆：`{ routeId, variantKey, headsign, status, dueCount, newCount, totalCards, nextReviewAt }`。
  - `dueCount`：`isCardDue(card, now)` 為真的卡片數（來自既有 `DueLearningCardsQueryPort`）。
  - `newCount`：`NewLearningCardsQueryPort` 的新卡數。
  - `nextReviewAt`：未到期卡片中最近的 `nextReviewAt`（都到期則為 now、無卡則 null）。
- 以新的 application use-case `GetReviewSummaryUseCase` 組合既有 port（due/new 查詢 + progress 列舉），
  不新增 Prisma schema；若需列舉「某 driver 全部 enrolled variant」，補一個 repository 查詢方法。
- Zero-auth：driver 用 `DEFAULT_DRIVER_ID`，client 不送 driverId。
- 錯誤信封沿用 `{ error: { code, message } }`。

### 2. 前端：複習儀表板
- 新增 `ReviewDashboard` client component：呼叫 `/api/review/summary`，四態（載入中/成功/空/錯誤）。
- 每個 variant 卡片顯示：路線+終點、`dueCount` 到期徽章（0 時淡化）、newCount、下次複習時間（相對時間），
  以及「開始複習」CTA（連到 `/practice/recall`，沿用 Change 10 的練習流程）。
- 依到期數由多到少排序，讓最該複習的排最前。
- 整合進首頁 `/`：路線列表上方加「待複習」區塊（或獨立 `/review` 頁，實作時定案）。

### 3. api-client 擴充
- `src/app/_lib/api-client.ts` 加 `getReviewSummary()`，沿用既有 `{data}/{error}` 解析與 `ApiError`。

### 4. 測試策略（TDD）
- 後端：use-case 單元測試（due/new/nextReviewAt 計算、空 enrolled）、API route 測試（信封、錯誤映射）。
- 前端：元件測試 mock fetch、不打 DB（四態、排序、dueCount=0 淡化、CTA href）。

## Non-goals
- 通知/推播提醒複習（後續）。
- 跨 driver、認證（維持 zero-auth）。
- 修改 SRS 間隔演算法本身（Change 07-srs-scheduling 已定案）。
- recall 練習畫面本身（Change 10 已完成，這裡只連過去）。

## 影響
- 新增：`src/app/api/review/summary/route.ts`、`GetReviewSummaryUseCase` 及其 port/adapter、
  `ReviewDashboard` 元件與 api-client 方法、對應測試。
- 修改：`src/app/page.tsx`（掛入待複習區塊）、可能補一個 learning-progress repository 查詢方法。
- 完成後於 `openspec/changes/11-review-dashboard/specs/` 建 spec 並 archive。

## 決策（2026-09-23 人審定案）
1. ✅ 待複習視圖放**首頁 `/` 上方區塊**（司機一落地就看到），非獨立頁。
2. ✅ `GET /api/review/summary` **只列 enrolled variant**（未報名的走路線瀏覽報名流程）。
3. ✅ 相對時間用既有相依 **`date-fns`**。
