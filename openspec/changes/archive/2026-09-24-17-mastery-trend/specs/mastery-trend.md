# Specification: Mastery Trend (Change 17)

精熟度趨勢圖：由既有 `RecallAttempt` 事件日誌重放出每日精熟卡數時序，前端手刻 inline SVG 呈現。
不改 schema、不加 charting 依賴。

## 1. 精熟歷史查詢（port + adapter）

- `MasteryHistoryQueryPort.findMasteryEventsByDriver(driverId)` → `{ cardKey, resultingState, answeredAt }[]`（依 answeredAt 升冪）。
- `PrismaMasteryHistoryAdapter`：`recallAttempt.findMany({ where: { session: { driverId } }, orderBy: answeredAt asc })`，
  取 cardKey / resultingState / answeredAt。

## 2. 重放 use-case（`GetMasteryTrendUseCase`）

- 維護 `Map<cardKey, CardState>`，依時間逐筆套用 `resultingState`。
- 以 **UTC 日**（`answeredAt.toISOString().slice(0,10)`）分桶；每個有結算的日期在套用完當日事件後，
  快照當下 MASTERED 卡數，輸出 `{ date, masteredCount }`。
- 狀態**跨日延續**；某卡 lapse（離開 MASTERED）→ 後續日期回落。
- 同日多筆取最終態；無事件 → `[]`。
- `MasteryTrendPoint = { date: string; masteredCount: number }`。

## 3. API

- `GET /api/review/mastery-trend` → `{ data: MasteryTrendPoint[] }`（default driver）。

## 4. 前端：手刻 inline SVG

- `api-client` 加 `MasteryTrendPoint` 型別與 `getMasteryTrend()`。
- `MasteryTrend`：
  - 有資料 → `<svg role="img" aria-label="精熟度趨勢：最高 N 張精熟，共 M 天紀錄">`，
    polygon（面積）+ polyline（折線）+ 每點 `<circle data-testid="trend-point">` 含 `<title>` 日期/數值。
    Y 軸依最大值縮放（下限 1），X 軸依日期序等距。
  - 空資料 → 友善提示「開始練習後，這裡會出現你的精熟度進步曲線。」
  - 載入中 / 錯誤 → 靜默（回傳 null）。
- 首頁 `/` 新增「精熟度趨勢」section，置於「待複習」儀表板之下、「所有路線」之上。

## 5. 測試（TDD，全綠）

- adapter 整合測試（真 DB）：driver 過濾、answeredAt 升冪、空。
- use-case（純邏輯）：逐日快照、跨日延續、lapse 回落、同日多筆、空。
- API route 整合測試：回應時序、空。
- api-client：型別/解析。
- MasteryTrend：SVG 點數/aria-label、空提示、載入/錯誤靜默。
- 首頁整合：趨勢 section 在儀表板之下。

## Non-goals
- 每 variant 個別趨勢、正確率/練習量圖表；charting 函式庫；schema 變更。
