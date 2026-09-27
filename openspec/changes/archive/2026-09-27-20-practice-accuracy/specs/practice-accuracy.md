# Specification: Practice Accuracy (Change 20)

整體練習正確率統計：由 `RecallAttempt.outcome`（PASS/FAIL）算 passed/total，首頁 stat 卡顯示。
不改 schema、不加依賴。

## 1. 後端

- `PracticeStatsQueryPort.countOutcomesByDriver(driverId)` → `{ total, passed }`
  （`recallAttempt` 經 session.driverId；passed = outcome PASS）。
- `PrismaPracticeStatsAdapter`：兩次 `count`（total、outcome=PASS）。
- `GetPracticeAccuracyUseCase` → `{ totalAttempts, passedAttempts, accuracy }`，
  `accuracy = total>0 ? passed/total : 0`（0–1）。
- `GET /api/review/accuracy` → `{ data: PracticeAccuracy }`（default driver）。

## 2. 前端

- `api-client.getPracticeAccuracy()` + `PracticeAccuracy` 型別。
- `AccuracyStat`：`totalAttempts>0` → 「正確率 {round(accuracy*100)}%」＋「{passed} / {total} 題答對」；
  `=0` → 友善提示；載入中/錯誤 → 靜默（回傳 null）。
- 首頁 `/`：AccuracyStat 卡置於「精熟度趨勢」section 上方。

## 3. 測試（TDD，全綠）

- adapter（真 DB）：total/passed 計數、排除他 driver、空。
- use-case：accuracy 計算（一般 0.75 / 全對 1 / 零題 0 非 NaN）。
- API route（真 DB）：正確率、空。
- api-client：`getPracticeAccuracy` 解析。
- AccuracyStat：顯示%與答對/總題、零紀錄提示、載入/錯誤靜默。
- 首頁整合：有紀錄顯示正確率。

## Non-goals
- per-variant / 每日 / 時間窗正確率；schema 變更；charting。
