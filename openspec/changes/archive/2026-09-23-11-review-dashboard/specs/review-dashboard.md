# Specification: Review Dashboard (Change 11)

複習到期視覺化：一條 API + UI vertical slice，讓司機在首頁看到各 enrolled variant
的複習負荷並一鍵開始練習。只列 enrolled variant，driver 用 `DEFAULT_DRIVER_ID`。

## 1. 後端彙總 use-case（`GetReviewSummaryUseCase`）

- 依賴窄 port `ListDriverProgressPort.findAllByDriver(driverId)`（回傳帶 cards 的
  `DriverVariantProgress[]`）+ `Clock`。不新增 Prisma schema。
- 對每個 enrolled variant，由其 cards 直接計算：
  - `dueCount` = `isCardDue(card, now)` 為真的卡數。
  - `newCount` = `state === NEW` 的卡數。
  - `totalCards` = 卡片總數。
  - `nextReviewAt` = 未到期卡片（`nextReviewAt > now`）中最早者的 ISO 字串；無則 `null`。
- 輸出依 `dueCount` 由多到少排序（同分再 `nextReviewAt` 早者、`variantKey`）。
- `VariantReviewSummary = { routeId, variantKey, directionId, status, dueCount, newCount, totalCards, nextReviewAt }`。
- 註：v1 不含 `headsign`（需 GTFS variant 查詢，避免 N 次查詢與額外耦合）；前端點進
  路線瀏覽頁可見 headsign。列為後續增強。

## 2. 資料存取（Prisma adapter）

- `PrismaLearningProgressRepository` 新增 `findAllByDriver`（`findMany` by driverId、
  `include: cards`、`orderBy enrolledAt asc`），同時 implements `ListDriverProgressPort`。

## 3. HTTP API

- `GET /api/review/summary` → `{ data: VariantReviewSummary[] }`（200）。
- driver 固定 `DEFAULT_DRIVER_ID`；client 不送 driverId。
- 例外 → `{ error: { code: 'INTERNAL_ERROR', message } }`（500）。

## 4. 前端

- `api-client.getReviewSummary()`：沿用 `{data}/{error}` 解析與 `ApiError`。
- `ReviewDashboard`（client component）四態：載入中 `role=status` / 成功 / 空 / 錯誤 `role=alert`。
  - 依 API 回傳順序渲染（排序在後端）。
  - 每列：方向（0 去程 / 1 返程）＋路線、到期徽章（`dueCount>0` 顯著「N 待複習」，
    `=0` 淡化為「無到期」）、新卡數、`date-fns` 相對「下次複習」時間、「開始複習」CTA
    連 `/practice/recall`。
- 首頁 `/`：「待複習」區塊置於「所有路線」列表之上。

## 5. 測試（TDD，全綠）

- use-case 單元測試（due/new/nextReviewAt/排序/空）、Prisma adapter 整合測試、
  API route 整合測試、api-client 契約測試、ReviewDashboard 四態、首頁整合。
- 前端一律 mock fetch、不打 DB；整合測試 afterAll 自清。

## Non-goals
- 複習提醒/推播、跨 driver、認證、SRS 間隔演算法調整、headsign 顯示（後續）。
