# Proposal: 19-per-variant-trend

狀態：`proposed`（等人審通過後進入實作）
編號：19。

## Why

Change 17 的精熟度趨勢是**整體**（driver 全部卡）。司機想知道「**這條 variant** 我進步得如何」——
在路線詳情頁看到每個已報名 variant 各自的進步曲線，才能針對弱項加強。

`RecallAttempt` 經 `session.targetVariantKey` 可過濾單一 variant，重放邏輯與 Change 17 完全相同，
只是事件範圍縮小。因此本 change 是 Change 17 的自然延伸——**不改 schema、不加依賴、重用重放與 SVG 圖**。

## What Changes

### 1. 後端：趨勢查詢支援 variantKey 過濾
- `MasteryHistoryQueryPort.findMasteryEventsByDriver(driverId, variantKey?)` 加**選用** `variantKey`；
  adapter 的 where 在有 variantKey 時加 `session: { targetVariantKey: variantKey }`。（向下相容，Change 17 呼叫不變。）
- `GetMasteryTrendUseCase` command 加選用 `variantKey`，透傳給 port。重放邏輯不動。
- `GET /api/review/mastery-trend` 讀選用 query `?variantKey=`，帶入 use-case；無則維持整體趨勢。

### 2. 前端：MasteryTrend 參數化 + 路線詳情頁顯示
- `api-client.getMasteryTrend(variantKey?)`：有值時附 `?variantKey=`（encodeURIComponent）。
- `MasteryTrend` 元件加選用 `variantKey` prop：有則抓該 variant 的趨勢（其餘渲染/空/靜默行為不變）。
  首頁既有用法（無 prop）＝整體趨勢，**行為不變**。
- 路線詳情頁 `VariantList`：每個**已報名** variant 列下方顯示其 mini 趨勢（`<MasteryTrend variantKey=.. />`）。
  未報名 variant 不顯示（沒有練習資料）。

### 3. 韌性
- 趨勢為增益：每個 variant 的趨勢載入/錯誤靜默，不影響 variant 列表主資料。

### 4. 測試策略（TDD）
- adapter：帶 variantKey → where 加 targetVariantKey 過濾（真 DB，afterAll 自清）。
- use-case：command 帶 variantKey → 透傳（純邏輯 fake port 驗參數）。
- API route：`?variantKey=` → 過濾；無 → 整體（整合測試）。
- api-client：`getMasteryTrend(variantKey)` 帶 query。
- VariantList：已報名列渲染帶 variantKey 的 MasteryTrend；未報名不渲染。
- 既有整體趨勢（Change 17）、VariantList（Change 12）測試無回歸。

## Non-goals
- schema 變更、charting 依賴（沿用手刻 SVG）。
- 儀表板每列趨勢（先放路線詳情頁，避免儀表板 N 圖過重）。

## 影響
- 修改：`mastery-history-query-port.ts`、`prisma-mastery-history-adapter.ts`、
  `get-mastery-trend-use-case.ts`、`mastery-trend/route.ts`、`api-client.ts`、
  `mastery-trend.tsx`、`variant-list.tsx` 及對應測試。
- 完成後於 `specs/` 建 spec 並 archive。

## 開放問題（請審核時定案）
1. 位置＝**路線詳情頁**每個已報名 variant 列下方 mini 趨勢？（傾向如此，per-variant 語境最貼切。）
2. 沿用 `?variantKey=` 過濾同一端點（而非新端點）？（傾向如此，最小改動。）
3. 未報名 variant 不顯示趨勢？（傾向如此，無資料。）
