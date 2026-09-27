# Proposal: 21-per-variant-accuracy

狀態：`proposed`（使用者已授權連續開發，決策直接鎖定）
編號：21。

## Why

Change 20 給了**整體**正確率。搭配 Change 19 的 per-variant 趨勢，司機在路線詳情頁若也能看到
**該 variant 的正確率**，就能針對弱項路線加強。這是 Change 20 的自然延伸（同 Change 19 的做法）。

## What Changes

### 1. 後端：正確率統計加選用 variantKey（向下相容）
- `PracticeStatsQueryPort.countOutcomesByDriver(driverId, variantKey?)`：帶 variantKey 時
  adapter where 加 `session: { targetVariantKey: variantKey }`。
- `GetPracticeAccuracyUseCase` command 加選用 `variantKey`，透傳。
- `GET /api/review/accuracy?variantKey=`：讀選用 query；無則整體（Change 20 行為不變）。

### 2. 前端：AccuracyStat 參數化 + 路線詳情頁
- `api-client.getPracticeAccuracy(variantKey?)`：有值附 `?variantKey=`。
- `AccuracyStat` 加選用 `variantKey` prop：
  - 有 variantKey → **compact 內嵌**呈現（「正確率 X%（passed/total）」小字），供列內顯示；
  - 無 → 維持整體大卡（首頁行為不變）。
  - 零紀錄/載入/錯誤行為不變（compact 時零紀錄可顯示「尚無紀錄」小字或不顯示）。
- 路線詳情頁 `VariantList`：已報名列在 mini 趨勢旁/下顯示該 variant 的 compact 正確率。

## 決策（鎖定）
1. ✅ 沿用 `?variantKey=` 過濾同端點（比照 Change 19）。
2. ✅ AccuracyStat 有 variantKey → compact 內嵌；無 → 整體大卡。
3. ✅ 顯示於路線詳情頁已報名 variant 列（與 per-variant 趨勢並列）。

## Non-goals
- 每日/時間窗正確率；schema 變更；charting。

## 影響
- 修改：`practice-stats-query-port.ts`、`prisma-practice-stats-adapter.ts`、
  `get-practice-accuracy-use-case.ts`、`accuracy/route.ts`、`api-client.ts`、
  `accuracy-stat.tsx`、`variant-list.tsx` 及測試。
- 完成後於 `specs/` 建 spec 並 archive。
