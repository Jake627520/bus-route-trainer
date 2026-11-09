#!/bin/sh
# Vercel build.
# production: migrate with DIRECT_URL, then next build.
# preview: migrate only when PREVIEW_DIRECT_URL is set, and only that URL.
#          DIRECT_URL is not used here; it may point at production.
# otherwise: prisma generate and next build, no migrate.
set -eu

# A Neon database that scaled to zero can take longer to wake than Prisma's
# connect timeout. Retry only connection errors, so a failing migration still
# stops the build at once.
migrate_deploy() {
  attempt=1
  while :; do
    status=0
    output=$(prisma migrate deploy 2>&1) || status=$?
    printf '%s\n' "$output"
    [ "$status" -eq 0 ] && return 0

    case "$output" in
      *P1001* | *P1002*) ;;
      *) return "$status" ;;
    esac
    [ "$attempt" -ge 5 ] && return "$status"

    echo "migrate deploy: database not ready (attempt $attempt of 5), retrying"
    attempt=$((attempt + 1))
    sleep "${MIGRATE_RETRY_DELAY_SECONDS:-10}"
  done
}

prisma generate

if [ "${VERCEL_ENV:-}" = "production" ]; then
  migrate_deploy
elif [ "${VERCEL_ENV:-}" = "preview" ] && [ -n "${PREVIEW_DIRECT_URL:-}" ]; then
  # The subshell keeps these values away from next build.
  (
    export DATABASE_URL="$PREVIEW_DIRECT_URL" DIRECT_URL="$PREVIEW_DIRECT_URL"
    migrate_deploy
  )
fi

next build
