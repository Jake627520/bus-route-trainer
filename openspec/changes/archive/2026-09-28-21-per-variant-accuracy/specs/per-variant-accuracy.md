# Specification: Per-variant Accuracy (Change 21)

Change 20 的整體正確率延伸為每 variant 個別正確率（比照 Change 19 per-variant 趨勢）。

## 1. 後端過濾（選用 variantKey）
- `PracticeStatsQueryPort.countOutcomesByDriver(driverId, variantKey?)`：帶 variantKey →
  adapter where 加 `session: { targetVariantKey }`；不帶則整體（Change 20 不變）。
- `GetPracticeAccuracyUseCase` command 加選用 variantKey 透傳。
- `GET /api/review/accuracy?variantKey=`：讀選用 query；無則整體。

## 2. 前端
- `api-client.getPracticeAccuracy(variantKey?)`：有值附 `?variantKey=`。
- `AccuracyStat` 加選用 variantKey prop：有→compact「正確率 X%（passed/total）」/零紀錄提示；
  無→整體大卡。載入/錯誤靜默。
- `VariantList` 已報名列在 per-variant 趨勢旁顯示 compact 正確率；未報名不顯示。

## 3. 測試（TDD 全綠）
adapter/API 過濾、api-client query、AccuracyStat compact 與大卡、VariantList 顯示、無回歸。

## Non-goals
每日/時間窗正確率；schema 變更；charting。
