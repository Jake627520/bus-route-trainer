# Proposal: 40-gtfs-autoupdate

狀態：`proposed`
編號：40。

## Why

Translink 每週（約週五）更新 SEQ GTFS。要自動同步到 Neon。Vercel serverless 函式秒級逾時，無法跑 3M 筆匯入，故用 **GitHub Actions 排程**（runner 6h、網路佳）。

## What Changes

- `scripts/import-gtfs.ts` 加 `--clear`（匯入前清空 gtfs 表，用於整份 feed 重新整理；driver 進度為 soft ref 不受影響）。
- `.github/workflows/gtfs-update.yml`：週日（Brisbane）排程 + 可手動觸發。下載 SEQ feed（https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip）→ 以 feed_info 的 start-end date 當版本，與 `.github/gtfs-feed-version` 比對 → 有變更才重灌（bus --clear + ferry + train 子集 50）→ 更新版本標記並 commit。
- 需 repo secret `GTFS_DATABASE_URL`（Neon direct URL）。

## Non-goals
- 密碼重設（Change 41）。即時 GTFS-RT。train 全量。

## 風險與測試
- 匯入器測試不受影響（--clear 僅 script 層）；守門三綠（eslint / 667 vitest / build）；YAML 驗證通過。
- feed URL 已驗證可下載（HTTP 200、週更）。feed_info 無 feed_version 欄，改用 start-end date 當版本。
- 首次請使用者在 GitHub 加 `GTFS_DATABASE_URL` secret，再手動 Run workflow 驗證。
