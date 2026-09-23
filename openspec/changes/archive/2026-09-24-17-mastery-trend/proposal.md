# Proposal: 17-mastery-trend

狀態：`proposed`（等人審通過後進入實作）
編號：17。

## Why

Change 14 讓司機看到**當下**的精熟度，但看不到「**進步曲線**」——這週比上週精熟了幾張、有沒有在進步。
趨勢是持續練習最有效的激勵。

關鍵發現：`RecallAttempt` 其實是**完整事件日誌**，每次結算都記了 `answeredAt`（時間戳）、
`resultingState`（該卡結算後狀態，含 `MASTERED`）、`cardKey`，且可經 `session.driverId` 過濾。
**因此精熟度趨勢可由既有資料重建——不用改 schema、不用新增歷史快照表。**

Change 17 交付**精熟度趨勢圖**：後端由 attempt 日誌重放出每日精熟卡數時序，前端以**手刻 inline SVG**
（不加 charting 依賴）畫出趨勢。

## What Changes

### 1. 後端：由 attempt 日誌重放精熟時序
- 新增 port `MasteryHistoryQueryPort.findMasteryEventsByDriver(driverId)`
  → `{ cardKey, resultingState, answeredAt: Date }[]`（依 answeredAt 升冪）。
- Prisma adapter：`recallAttempt.findMany({ where: { session: { driverId } }, orderBy: answeredAt asc })`
  取 cardKey / resultingState / answeredAt。
- `GetMasteryTrendUseCase`：**重放**事件——維護 `Map<cardKey, CardState>`，依時間逐筆套用 resultingState；
  以 UTC 日期分桶，每個「有結算的日期」在處理完當日事件後快照 `masteredCount`
  （state===MASTERED 的 cardKey 數），輸出 `{ date: 'YYYY-MM-DD', masteredCount }[]`。
  無任何 attempt → 空陣列。
- `GET /api/review/mastery-trend` → `{ data: MasteryTrendPoint[] }`（default driver）。

### 2. 前端：手刻 inline SVG 趨勢圖
- `api-client` 加 `MasteryTrendPoint` 型別與 `getMasteryTrend()`。
- `MasteryTrend` component：以 SVG polyline/area 畫每日 masteredCount；
  - `role="img"` + `aria-label` 摘要（例：「精熟度趨勢：最高 N 張」）。
  - 每個資料點加 `data-testid` 供測試；X 軸為日期序、Y 軸為卡數。
  - 空資料（無 attempt）→ 友善空狀態「開始練習後這裡會出現你的進步曲線」。
  - 載入中/錯誤 → 靜默（增益，不阻塞首頁）。
- 首頁 `/` 新增「精熟度趨勢」section，置於「待複習」儀表板之下。

## Non-goals
- 每 variant 個別趨勢、跨指標（正確率/練習量）圖表——先做整體精熟度趨勢。
- 加入 charting 函式庫（改用手刻 SVG）。
- schema 變更（完全由既有 attempt 日誌重建）。

## 影響
- 新增：`MasteryHistoryQueryPort` + Prisma adapter、`GetMasteryTrendUseCase`、
  `GET /api/review/mastery-trend`、`MasteryTrend` 元件、api-client 方法，及測試。
- 修改：`src/app/page.tsx`（掛入 section）、首頁整合測試。
- 完成後於 `specs/` 建 spec 並 archive。

## 決策（2026-09-23 人審定案）
1. ✅ 指標＝每日結束時處於 MASTERED 的卡數（resultingState 重放，隨 lapse 回落）。
2. ✅ 圖表＝手刻 inline SVG，不加 charting 依賴。
3. ✅ 位置＝首頁「待複習」儀表板之下新增「精熟度趨勢」section。
4. ✅ 日期分桶用 UTC。
