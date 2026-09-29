# Proposal: 24-route-search

狀態：`proposed`（使用者已授權連續開發，決策直接鎖定）
編號：24。（跨 variant session 經人審暫緩，改做此低風險項。）

## Why

GTFS 路線可能有上百條，`RouteList` 目前是平列，司機很難找到特定路線。加一個**即時搜尋框**
（依 shortName / longName 過濾）能大幅改善可用性。純前端、零後端、獨立於複雜的 recall 核心。

## What Changes

### `RouteList` 加搜尋框
- `ready` 狀態（有路線）時，列表上方顯示搜尋輸入框（`type="search"`, aria-label「搜尋路線」）。
- 依輸入即時過濾：對 `shortName` 或 `longName` 做**不分大小寫**的 substring 比對（trim 後空字串＝顯示全部）。
- 過濾後無結果 → 顯示「找不到符合的路線」提示（搜尋框保留可清除）。
- 無路線（routes 為空）→ 維持既有空狀態（不顯示搜尋框）。
- 載入中/錯誤 → 行為不變。

## 決策（鎖定）
1. ✅ 搜尋範圍＝shortName + longName，不分大小寫 substring。
2. ✅ 客戶端即時過濾（不新增 API；資料已由 GET /api/routes 取得）。
3. ✅ 無結果顯示提示、搜尋框保留。

## Non-goals
- 後端搜尋/分頁；模糊比對/拼音；依 routeType 篩選（後續可加）。

## 影響
- 修改：`src/app/_components/route-list.tsx` 及其測試。
- 完成後於 `specs/` 建 spec 並 archive。
