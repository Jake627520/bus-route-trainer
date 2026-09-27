# Specification: Per-variant Mastery Trend (Change 19)

Change 17 的整體精熟度趨勢延伸為**每 variant 個別趨勢**：後端趨勢查詢/端點加選用
`variantKey` 過濾（向下相容），前端 `MasteryTrend` 參數化，路線詳情頁每個已報名 variant
顯示自己的 mini 趨勢。重用 Change 17 的重放與手刻 SVG，不改 schema、不加依賴。

## 1. 後端過濾（選用 variantKey）

- `MasteryHistoryQueryPort.findMasteryEventsByDriver(driverId, variantKey?)`：帶 variantKey 時
  adapter where 加 `session: { targetVariantKey: variantKey }`；不帶則整體（Change 17 行為不變）。
- `GetMasteryTrendUseCase` command 加選用 `variantKey`，透傳給 port；重放邏輯不變。
- `GET /api/review/mastery-trend?variantKey=`：讀選用 query 帶入 use-case；無則整體趨勢。

## 2. 前端

- `api-client.getMasteryTrend(variantKey?)`：有值時附 `?variantKey=<encodeURIComponent>`。
- `MasteryTrend` 加選用 `variantKey` prop：有則抓該 variant 的趨勢（effect 依 variantKey）；
  空/載入/錯誤與渲染行為同 Change 17。無 prop＝整體趨勢，首頁用法不變。
- 路線詳情頁 `VariantList`：**已報名** variant 列（`enrolledStatus` 非 null）下方渲染
  `<MasteryTrend variantKey={v.variantKey} />`；未報名不渲染。每列趨勢載入/錯誤靜默。

## 3. 測試（TDD，全綠）

- adapter（真 DB）：帶 variantKey 只回該 variant 事件；不帶回整體。
- use-case：command variantKey 透傳給 port。
- API route（真 DB）：`?variantKey=` 過濾 vs 整體。
- api-client：`getMasteryTrend(variantKey)` 附 query（encodeURIComponent）。
- MasteryTrend：帶 variantKey prop → 抓該 variant；無 prop 行為不變。
- VariantList：已報名列抓 per-variant 趨勢、未報名不抓；既有 variant 測試無回歸。

## Non-goals
- schema 變更、charting 依賴；儀表板每列趨勢（避免 N 圖過重）；後端跨 variant 單一 session。
