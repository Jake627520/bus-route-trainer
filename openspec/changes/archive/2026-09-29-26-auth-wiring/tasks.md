# Tasks: 26-auth-wiring

> TDD（先紅後綠）。行為等價接線：無 session 維持 DEFAULT，帶 session 改用登入司機。守門三綠：`eslint` / `vitest run --fileParallelism=false`（不破壞既有 615）/ `next build`。

## Phase 26.1: session helper
- [x] Task 1: `readSessionDriverId(request): string | null`（有效→driverId、無/無效/過期→null）測試 + 實作；`resolveDriverId` 改用它 <!-- id: 26-01 -->

## Phase 26.2: API route 接線
- [x] Task 2: `review/*`（streak/accuracy/mastery-trend/summary）改用 `resolveDriverId(request)`；新增「帶 session→登入司機」測試 <!-- id: 26-02 -->
- [x] Task 3: `progress/enroll`、`progress/[variantKey]` 改用 `resolveDriverId(request)`；新增帶 session 測試 <!-- id: 26-03 -->
- [x] Task 4: `resolveAuthenticatedDriver(request)` 優先讀 session cookie（recall route）；新增帶 session 測試，無 session 行為不變 <!-- id: 26-04 -->

## Phase 26.3: 頁面保護 + 登出 UI
- [x] Task 5: `src/proxy.ts`（matcher 排除 api/_next/靜態/login）；無有效 session→導 /login、已登入訪 /login→導 /；用 `unstable_doesProxyMatch` + proxy 函式測試 <!-- id: 26-05 -->
- [x] Task 6: 首頁登入帳號顯示 + 登出鈕（點擊 POST /api/auth/logout → 導 /login）測試 + 實作 <!-- id: 26-06 -->

## Phase 26.4: 守門與收尾
- [x] Task 7: 全套守門（lint + test + build 全綠；不破壞既有 615）<!-- id: 26-07 -->
- [x] Task 8: 建 spec；`openspec archive 26-auth-wiring`；開 PR、CI 綠 auto-merge <!-- id: 26-08 -->

## 注意
- 接線行為等價：`resolveDriverId` 無 session 仍回 DEFAULT_DRIVER_ID，既有測試不動。
- 頁面保護走 Next 16 `proxy.ts`（非 middleware）；proxy 預設 Node runtime，可用 `verifySession`。
- 不移除 use-case 層 DEFAULT_DRIVER_ID 後備（留給部署前收尾）。
