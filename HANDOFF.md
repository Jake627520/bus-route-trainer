# 交接手冊（Handoff）

> 給接手的 agent（Claude Code / Antigravity）：先讀這份，再讀 [AGENTS.md](./AGENTS.md)（長期慣例）。
> 最後更新：2026-10-14，對應 Change 51（PWA，合併後即為 `main`）。

## 一句話
昆士蘭（SEQ）巴士司機「路線記憶訓練器」。已上線（Vercel + 獨立 Postgres），有帳號登入、雙語（en / zh-TW）、SRS 複習、五種題型（下一站、上一站、路口填空、站號、單字填空），可安裝到主畫面、離線時顯示離線頁。**目前沒有進行中的 change**（`openspec/changes/` 只有 `archive/`）。

## 技術棧與開發方式
Next.js 16（App Router）+ React 19 + TypeScript / Prisma 6 + PostgreSQL / Vitest + Testing Library / Playwright。流程：OpenSpec（規格先行）+ TDD。
- 指令：`npm test`（= `vitest run --fileParallelism=false`，整合測試要真的 DB）、`npm run lint`、`npm run build`。
- 標準環境是 Docker / Dev Container：
  ```bash
  export PATH="$HOME/.docker/bin:$PATH"
  docker compose up -d db
  docker compose run --rm app npm ci
  docker compose run --rm app npx prisma generate && docker compose run --rm app npx prisma migrate deploy
  docker compose run --rm app npm test
  docker compose run --rm --service-ports app npm run dev   # → http://localhost:3000
  ```
- 雲端 session 沒有 Docker，但機器上有 Postgres 16：`pg_ctlcluster 16 main start`，再以 `su postgres -c psql` 建使用者與 DB、`DATABASE_URL=... npx prisma migrate deploy`，即可本機跑完整測試（`foundation.test.ts` 固定檢查 DB 名為 `bus_route_trainer`，要用這個名字才會全綠）。
- Next 16 有破壞性變更：寫程式前先讀 `node_modules/next/dist/docs/`。`cookies()` / `headers()` 是 async。
- 部署與環境變數見 [DEPLOY.md](./DEPLOY.md)。

## 已完成的 Change（詳見 `openspec/changes/archive/`）
| # | 內容 |
|---|---|
| 01–29 | 專案基礎、GTFS 匯入/查詢、學習狀態、recall session（領域/流程/API/UI）、SRS、路線瀏覽、儀表板、精熟度/準確率/連續天數、批次練習、搜尋、認證（帳號密碼 + session cookie）、部署設定、GTFS 公車過濾、強制 401 |
| 30 | i18n 基建（自建，cookie `brt_locale` → `Accept-Language` → 後備 `en`）+ 登入頁與首頁 |
| 31 | 儀表板元件與路線頁雙語化 |
| 32 | recall 練習頁雙語化（全站 100% 雙語） |
| 33 | Brisbane 時區日界（streak/趨勢不再用 UTC）+ 相對時間在地化 |
| 34 | 視覺打磨（愛琴海鈷藍） |
| 35 | 改用 Translink 官方配色（深藍 + 洋紅粉） |
| 36 | 載入骨架（Skeleton）+ 首頁深色漸層 feature 錨點 |
| 37 | 共用 review summary 快取（首頁 4 次 fetch → 1 次） |
| 38 | 共用 practice streak（2 次 → 1 次） |
| 39 | train / ferry 模式（匯入器加 `maxRoutes`，train 只取子集以控制 DB 大小） |
| 40 | GTFS 自動更新（GitHub Actions 週更，`.github/workflows/gtfs-update.yml`） |
| 41 | 密碼重設（Resend email 重設連結） |
| 42 | 密碼強度政策（註冊與重設共用） |
| 43 | 練習頁顯示精簡 + 寬鬆答案比對 + next-stop 改比對站名 |
| 44 | 答錯時顯示正確答案（`correctAnswer` 只在 FAIL 回傳；prompt API 仍絕不外洩答案） |
| 45 | 新題型：路口填空（`CROSS_STREET_RECALL`）、站號題（`STOP_NUMBER_RECALL`）；取代會洩題的「辨識站名」；解析不出結構的站退回舊題型 |
| 46 | 既有報名自動補發新題型卡片（`cardsVersion` + `BackfillVariantCardsUseCase`，只新增、不動既有 SRS 進度） |
| 47 | 單字填空題 `WORD_CLOZE_RECALL`：沒有路口/站號的車站類站名，遮月台號或最長關鍵字（單字站名只給首字母）；提示永不含答案 |
| 48 | 無障礙與鍵盤：Modal 焦點管理、`useAdvanceShortcut`（不搶按鈕操作）、常駐 `LiveAnnouncer`、提示 `aria-describedby`、SkipLink、`:focus-visible` |
| 49 | 認證端點限流：login 每 IP 15 分 30 次＋同帳號失敗 5 次暫鎖 15 分（成功清除）、register／forgot／reset 每 IP 每小時 10／10／20、同 email 每小時 3 封（超限靜默回 200 不寄信）；Postgres 原子計數（`auth_rate_limit`），元件故障 fail-open |
| 50 | 新題型「上一站是哪裡」`PREVIOUS_STOP_BACKWARD`：新卡 `PREV_STOP::{from}->{to}`（每對相鄰站一張，第一站沒有；相鄰同名站不出）、`CardType.PREV_STOP`；卡片組版本 2，既有報名下次練習時自動補發（只新增、不動既有進度）；給站 B 答前一站 A，寬鬆比對 |
| 51 | PWA（等級 A）：manifest＋圖示可安裝、`public/sw.js`（離線頁；`/_next/static` 快取優先；**不快取 /api 與 HTML**）、`OfflineBanner`、提交失敗後恢復連線自動重送一次。離線練習（答案放裝置）刻意未做 |

> 41–43 只有 commit 標題可查，沒有 archive 資料夾；細節請看對應 PR（#38、#39、#41）。

## 注意事項
- **編號撞號歷史**：archive 內有兩個 01、兩個 07，以日期前綴區分。下一個新 change 請從 **52** 起。
- **Zero-Auth 已結束**：資料 API 一律需 session，未登入回 401。`DEFAULT_DRIVER_ID` 只保留作測試 seed。
- **別重複做 i18n**：`src/i18n/`（`config.ts` / `messages.ts` / `resolve.ts` / `t.ts`）已完成。新字串加進 `messages.ts`，en 與 zh-TW 必須同 key。
- 不要把交接內容寫進 AGENTS.md 的 `<!-- BEGIN/END:nextjs-agent-rules -->` 標記內（`next dev` 會覆寫）。
- 進度的唯一依據是 `openspec/changes/` 內未 archive 的 change 的 `tasks.md`。開工前先 `git fetch`、看 `main` 與開放中的 PR，避免像 Change 30 那樣兩邊撞工。

## Service worker 緊急停用（Change 51）
`public/sw.js` 寫壞可能讓使用者看到舊畫面。急救：把 `sw.js` 換成下面這段並部署（`/sw.js` 不被快取，裝置下次載入就會自我註銷並清快取）：
```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
    .then(() => self.registration.unregister())
));
```
改 `sw.js` 內容時順便把 `VERSION` 加一，舊快取會在新版啟用時清掉。SW 只在 production 註冊。

## 下一步候選（尚無提案，需與人確認）
- 題目品質：約 9.2% 的站名兩種新題型皆不適用，仍用舊的辨識站名。
- 路線範圍：train 有 707 條，目前只收子集。
- a11y 深化、更多語言、認證強化（rate limit、角色權限）。
- 候選：離線練習（PWA 等級 B）——答案要存在裝置上，與「答案絕不先送出」的安全原則衝突，另需同步／衝突設計，需先決策。
- 做法：與人確認 → `openspec/changes/47-xxx/`（proposal + tasks）→ 人審 → TDD → 守門三綠（lint / test / build）→ archive → PR。
