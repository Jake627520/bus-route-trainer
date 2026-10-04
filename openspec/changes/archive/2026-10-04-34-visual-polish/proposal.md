# Proposal: 34-visual-polish

狀態：`proposed`
編號：34。

## Why

功能與雙語完成，但視覺偏素樸（zinc 灰階 + 黑色按鈕，dashboard 與 recall 風格不一致）。做視覺/質感打磨，建立一致的品牌視覺。

## 技術決策（鎖定）

- **配色**：AI 配色急救圖鑑 **01 愛琴海白屋**（鈷藍 #2E5FA8 品牌主色，海玻璃藍/石灰砂為輔）。藍白清爽、運輸感、對比合格（鈷藍文字/白底 5.99:1、白字/鈷藍鈕 6.33:1）。
- **版面原則**：底近無彩紙感、主色只在少數地方、卡片圓角+柔陰影、動效 .15s 位移/淡入、尊重 reduced-motion。
- 走 Tailwind token（`@theme` 品牌色階 `brand-50..900`），不改既有 class 系統結構。

## What Changes

- `globals.css`：品牌色階 token（brand/seaglass/sand）、紙感底色（light #f5f7fb / dark #0b1220）、字體修正（Geist）、selection 色、reduced-motion。
- UI 原語（`src/components/ui`）：Button primary→品牌藍+陰影、Card rounded-2xl+柔陰影、Badge blue→品牌、ProgressBar→品牌、TextInput focus→品牌。
- dashboard 元件：黑色/sky CTA 統一為品牌藍（review-dashboard、variant-list、batch-practice-button、route-list 路線號碼徽章、login 按鈕）；卡片 rounded-2xl+shadow+hover lift。

## Non-goals
- 版面結構重排、載入骨架動畫（之後）。語意色（amber 到期/emerald 完成/red 錯誤）維持。

## 風險與測試
- 純樣式（className/CSS）變更，不動文案/結構/testid；既有 659 測試不受影響（唯一 Badge class 斷言更新）。
- 守門三綠：`eslint` / `vitest run --fileParallelism=false`（659）/ `next build`（驗證品牌 utility 生成 `.bg-brand-600{#2e5fa8}`）。
- 瀏覽器實測：recall 頁 light 模式紙感底+浮起卡+鈷藍鈕；dark 模式深藍黑底。
