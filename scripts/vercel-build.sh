#!/bin/sh
# Vercel build.
# production: migrate with DIRECT_URL, then next build.
# preview: migrate only when PREVIEW_DIRECT_URL is set, and only that URL.
#          DIRECT_URL is not used here; it may point at production.
# otherwise: prisma generate and next build, no migrate.
set -eu

prisma generate

if [ "${VERCEL_ENV:-}" = "production" ]; then
  prisma migrate deploy
elif [ "${VERCEL_ENV:-}" = "preview" ] && [ -n "${PREVIEW_DIRECT_URL:-}" ]; then
  # Assignment applies only to this command, not to next build.
  DATABASE_URL="$PREVIEW_DIRECT_URL" DIRECT_URL="$PREVIEW_DIRECT_URL" prisma migrate deploy
fi

next build
