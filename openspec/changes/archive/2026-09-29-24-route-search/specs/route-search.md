# Specification: Route Search (Change 24)

RouteList 加即時搜尋框，依 shortName/longName 客戶端過濾。純前端、零後端。

## RouteList 搜尋
- `ready`（有路線）時，列表上方顯示 `type="search"`（aria-label「搜尋路線」）輸入框。
- 即時過濾：對 `shortName` 或 `longName` 做不分大小寫 substring 比對；trim 後空字串＝全部。
- 過濾無結果 → 「找不到符合的路線。」提示，搜尋框保留。
- 無路線 → 既有空狀態（不顯示搜尋框）；載入中/錯誤 → 不變。

## 測試（TDD 全綠）
過濾（含不分大小寫、清空還原）、無結果提示、既有四態無回歸。

## Non-goals
後端搜尋/分頁；模糊/拼音；依 routeType 篩選。
