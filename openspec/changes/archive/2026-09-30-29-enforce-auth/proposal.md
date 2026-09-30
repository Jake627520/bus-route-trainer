# Proposal: 29-enforce-auth

狀態：`proposed`
編號：29。依賴 Change 25/26（認證）已合入 main。

## Why

Change 26 把 session 接進資料流，但為降風險保留了 `DEFAULT_DRIVER_ID` 後備（未登入仍可拿到 default driver 的資料）。上線前必須**強制認證**：未登入的資料 API 一律 401，各層不再靜默退回 default driver，達成真正的多租戶隔離。

## 範圍界定（重要）

盤點後確認：**recall 路徑（`resolveAuthenticatedDriver`）在 production 早已強制 401**——DEFAULT 只存在於 `NODE_ENV=test/dev` 的 seam，永遠不會服務到真實用戶。真正的 production 缺口是 **review/progress route 的 `resolveDriverId`**，它在**所有環境（含 prod）都退回 DEFAULT**，等於未登入者能拿到 default driver 的資料。本 change 聚焦修這個缺口；不動 recall（改它只會churn 52 個測試卻無 prod 安全收益）。

## What Changes

- **共用 helper**：`requireDriverId(request): string`（session.ts）——有 session→driverId、否則 throw `UnauthenticatedError`。
- **API 邊界（review + progress route）**：改用 `requireDriverId`；無 session → 401 UNAUTHENTICATED，不再退回 DEFAULT。
- **use-case**：`enroll-variant`、`get-variant-progress`（progress route 的 use-case）移除 `|| DEFAULT_DRIVER_ID`，`driverId` 改為必要。
- **`DEFAULT_DRIVER_ID` 常數保留**：僅作為測試 seed 用的已知 driverId。
- **不動 recall**：其 prod 早已強制 401，test/dev seam 屬測試基建。

## Non-goals
- 密碼重設、角色權限、rate limit（後續）。
- i18n、前端優化（使用者指定為後續方向）。

## 風險與測試（TDD）
- **route 測試**：帶 session cookie → 拿自己的資料（既有 seed 用 DEFAULT_DRIVER_ID，測試改帶該 driver 的 session）；無 cookie → 401（新增斷言）。
- **use-case 測試**：改為顯式傳 `driverId`（多數用 DEFAULT_DRIVER_ID 當測試 driver）。
- **driver-context 測試**：無身分 → 改為預期 throw UnauthenticatedError（原預期 DEFAULT）。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false` / `next build`。不得殘留「未登入可取資料」路徑。
