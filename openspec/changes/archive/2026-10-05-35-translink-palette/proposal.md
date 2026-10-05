# Proposal: 35-translink-palette

狀態：`proposed`
編號：35。承接 Change 34（視覺打磨），改用 Translink 官方品牌配色。

## Why

使用者要求用 Translink（translink.com.au）配色，且偏好「粉紅 + 藍」。擷取官網實際品牌色，正好是深藍 + 洋紅粉——與需求一致。

## 技術決策

- **配色＝Translink 官方**（從 translink.com.au 擷取）：
  - 深藍 NAVY **#242B4C**（主色；白字 13.8:1 AAA）＝ header/按鈕/文字/路線徽章/進度條
  - 洋紅 PINK **#EF60A3**（點綴；小字白字改用深粉 **#C42D7B** 5.2:1 AA）
- **用色比例照 Translink**：navy 為主、pink 少量 pop（官網本身＝navy 按鈕 + pink 點綴）。
- 沿用 Change 34 的 Tailwind `@theme` token 結構，只換 hex + 加 `pink-*` 色階。

## What Changes

- `globals.css`：`brand-*` 色階改 Translink navy（600=#242B4C）；新增 `pink-*` 色階；紙感底（light #f7f7f8 / dark #0e1326）；selection 改粉紅；移除未用的 seaglass/sand。
- 粉紅 pop（約 10%）：streak 連續天數數字（pink-600）、「練習全部到期」hero CTA（pink-700 白字 AA）、語言切換 active（pink-600 + 底線）。
- 其餘主要 CTA/徽章/進度條維持 brand（自動變 navy）。

## Non-goals
- 版面結構、載入骨架、feature 錨點（排入 Change 36）。

## 風險與測試
- 純樣式（className/CSS token）變更；659 測試不受影響（Badge 斷言已是 text-brand-700，navy 下仍成立）。
- 守門三綠：`eslint` / `vitest`（659）/ `next build`（驗 `.bg-brand-600{#242b4c}`、`.bg-pink-700{#c42d7b}` 生成）。
- 瀏覽器實測：recall 頁 navy 按鈕 + 粉紅 active 語言；對比 AAA/AA 達標。
