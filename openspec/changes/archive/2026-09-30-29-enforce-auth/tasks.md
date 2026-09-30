# Tasks: 29-enforce-auth

> TDD。目標：未登入的 review/progress 資料 API 一律 401，其 use-case 不再退回 DEFAULT。
> （recall 路徑的 `resolveAuthenticatedDriver` 在 production 早已 throw 401，DEFAULT 僅 test/dev seam，本 change 不動。）
> 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。

## Phase 29.1: review route 強制 401
- [x] Task 1: review/*（streak/accuracy/mastery-trend/summary）無 session→401 UNAUTHENTICATED；測試帶 cookie 取資料 + 無 cookie→401 <!-- id: 29-01 -->

## Phase 29.2: progress route 強制 401
- [x] Task 2: progress/enroll、progress/[variantKey] 無 session→401；測試帶 cookie + 無 cookie→401 <!-- id: 29-02 -->

## Phase 29.3: use-case 移除後備
- [x] Task 3: `enroll-variant`、`get-variant-progress` 移除 `|| DEFAULT_DRIVER_ID`，driverId 必要；測試顯式傳 driverId <!-- id: 29-03 -->

## Phase 29.4: 守門與收尾
- [x] Task 4: 全套守門（lint + test + build 全綠）<!-- id: 29-04 -->
- [x] Task 5: 建 spec；archive；開 PR、CI 綠 auto-merge <!-- id: 29-05 -->

## 注意與範圍界定
- **recall 路徑不動**：`resolveAuthenticatedDriver` 在 prod 無 session/gateway 早已 throw 401（DEFAULT 只在 test/dev seam，永不服務真實用戶），改動只會churn 52 個 recall 測試而無 prod 安全收益。
- 真正的 prod 缺口是 review/progress route 的 `resolveDriverId`（prod 也退回 DEFAULT）→ 本 change 修這個。
- DEFAULT_DRIVER_ID 常數保留為測試 seed。
- 共用 `requireDriverId(request)`：無 session→throw；route catch→401。
