# Proposal: 20-practice-accuracy

狀態：`proposed`（使用者已授權連續開發，決策直接鎖定）
編號：20。

## Why

司機看得到「練了多少、精熟多少」，但看不到「**答對率**」——正確率是最直接的表現指標。
`RecallAttempt.outcome`（PASS/FAIL）即現成資料，可算整體練習正確率。

## What Changes

### 1. 後端：正確率統計
- 新增 port `PracticeStatsQueryPort.countOutcomesByDriver(driverId)` → `{ total, passed }`
  （由 `recallAttempt` 經 session.driverId 統計；passed = outcome PASS）。
- Prisma adapter：兩次 count（total、outcome=PASS），或 groupBy。
- `GetPracticeAccuracyUseCase` → `{ totalAttempts, passedAttempts, accuracy }`，
  `accuracy = total>0 ? passed/total : 0`（0–1 分數；前端顯示 %）。
- `GET /api/review/accuracy` → `{ data: PracticeAccuracy }`（default driver）。

### 2. 前端：正確率 stat 卡
- `api-client.getPracticeAccuracy()` + `PracticeAccuracy` 型別。
- `AccuracyStat` 元件：`totalAttempts>0` → 顯示「正確率 {round(accuracy*100)}%」＋「{passed}/{total} 題答對」；
  `=0` → 友善提示「還沒有練習紀錄」；載入中/錯誤 → 靜默。
- 首頁「精熟度趨勢」section 附近顯示（stat 卡）。

## 決策（鎖定）
1. ✅ 本 change 做**整體**正確率（全部 attempts）；per-variant 正確率列為後續（可比照 Change 19 加 variantKey）。
2. ✅ 位置＝首頁，趨勢區塊附近的 stat 卡。
3. ✅ 無練習紀錄 → 顯示友善提示，不隱藏。

## Non-goals
- per-variant / 每日正確率、時間窗（最近 N 次）；schema 變更；charting。

## 影響
- 新增：`PracticeStatsQueryPort` + adapter、`GetPracticeAccuracyUseCase`、
  `GET /api/review/accuracy`、`AccuracyStat` 元件、api-client 方法，及測試。
- 修改：`src/app/page.tsx`（掛入 stat 卡）、首頁整合測試。
- 完成後於 `specs/` 建 spec 並 archive。
