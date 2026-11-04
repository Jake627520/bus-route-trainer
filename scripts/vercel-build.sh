#!/bin/sh
# Vercel build. Migrations run only for production so a preview build
# does not require a database that accepts prisma migrate deploy.
# Production (VERCEL_ENV=production) still generates, migrates, then builds.
set -eu

prisma generate

if [ "${VERCEL_ENV:-}" = "production" ]; then
  prisma migrate deploy
fi

next build
