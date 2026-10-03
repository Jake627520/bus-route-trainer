#!/usr/bin/env bash
# 一鍵把 .env.production.local 的環境變數推到 Vercel 並部署 production。
# 前置：1) Neon 註冊好，把 pooled/direct URL 貼進 .env.production.local
#       2) 先跑過 `vercel login`（瀏覽器授權，一次即可）
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.production.local ]]; then
  echo "找不到 .env.production.local"; exit 1
fi
# 讀入變數
set -a; # shellcheck disable=SC1091
source .env.production.local; set +a

if [[ "${DATABASE_URL:-}" == *"<貼上"* || -z "${DATABASE_URL:-}" ]]; then
  echo "請先在 .env.production.local 貼上 Neon 的 DATABASE_URL（pooled）"; exit 1
fi
if [[ "${DIRECT_URL:-}" == *"<貼上"* || -z "${DIRECT_URL:-}" ]]; then
  echo "請先在 .env.production.local 貼上 Neon 的 DIRECT_URL（direct）"; exit 1
fi
if [[ -z "${AUTH_SECRET:-}" ]]; then
  echo "AUTH_SECRET 未設"; exit 1
fi

# 需先登入
if ! vercel whoami >/dev/null 2>&1; then
  echo "尚未登入 Vercel，請先執行：vercel login"; exit 1
fi

echo "[1/3] 連結 Vercel 專案…"
vercel link --yes

echo "[2/3] 設定 production 環境變數…"
for VAR in AUTH_SECRET DATABASE_URL DIRECT_URL; do
  vercel env rm "$VAR" production --yes >/dev/null 2>&1 || true
  printf '%s' "${!VAR}" | vercel env add "$VAR" production
done

echo "[3/3] 部署 production（vercel-build 會自動 prisma migrate deploy）…"
vercel --prod

echo ""
echo "完成。部署後灌公車資料（用 Neon direct 連線）："
echo "  DATABASE_URL=\"\$DIRECT_URL\" DIRECT_URL=\"\$DIRECT_URL\" NODE_OPTIONS=--max-old-space-size=4096 \\"
echo "    npx tsx scripts/import-gtfs.ts ~/Downloads/seq_gtfs --bus-only"
