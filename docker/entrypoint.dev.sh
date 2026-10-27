#!/bin/sh
# Dev container entrypoint.
#
# Why this exists: `node_modules` is an anonymous volume that shadows the copy
# baked into the image, so the Prisma Client generated at image-build time is
# frozen. Whenever prisma/schema.prisma changes (e.g. a column moved from
# `customer_vehicles` to `vehicles`), the client inside the container keeps the
# OLD model and every query referencing a dropped column fails at runtime with
# "The column X does not exist in the current database".
#
# Re-generating the client on every start keeps it in lockstep with the schema,
# no matter how the volume was populated. This must run as root because the
# volume's files are root-owned (the image build generated them as root).
#
# The same drift applies to the database itself: the client can be regenerated
# while the dev DB still misses columns added by newer schema (dev is
# provisioned by `db push`, there is no migration history to replay). Queries
# then fail at runtime with "The column X does not exist in the current
# database" and code falls back silently. `db push` below (additive sync only,
# never --accept-data-loss) closes that gap on every start; when Prisma asks
# for a data-loss confirmation we stop and shout instead of guessing.
set -e

if [ -f /app/prisma/schema.prisma ]; then
  echo "[entrypoint] prisma generate (sync client with schema)…"
  # Never let a generation hiccup take down the dev server: warn and continue,
  # the previously generated client still works for an unchanged schema.
  # Local binary only (no registry fetch, no npx fallback).
  ./node_modules/.bin/prisma generate --schema /app/prisma/schema.prisma 2>/dev/null || \
    echo "[entrypoint] WARNING: prisma generate failed; using the existing client." >&2
  # Hand the freshly written client back to the runtime user so the dev server
  # (non-root) can read it and future writes stay owned by nextjs.
  chown -R nextjs:nodejs /app/node_modules/.prisma /app/node_modules/@prisma 2>/dev/null || true

  echo "[entrypoint] prisma db push (sync database with schema)…"
  # The DB may still be accepting connections on a cold compose start; give it
  # a short grace period, then sync. No --accept-data-loss on purpose: when
  # Prisma wants one (new unique constraints, dropped columns, …) a human
  # decides, and the warning below stays loud in every container log.
  push_ok=0
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    push_log="$(./node_modules/.bin/prisma db push --schema /app/prisma/schema.prisma 2>&1)" && push_ok=1
    echo "$push_log"
    if [ "$push_ok" = "1" ]; then
      break
    fi
    # A data-loss confirmation will not fix itself by retrying; stop at once.
    case "$push_log" in
      *accept-data-loss*) break ;;
    esac
    echo "[entrypoint] db push attempt $attempt failed; retrying in 3s…" >&2
    sleep 3
  done
  if [ "$push_ok" != "1" ]; then
    echo "[entrypoint] WARNING: database is NOT in sync with prisma/schema.prisma." >&2
    echo "[entrypoint] Run manually after checking for duplicates:" >&2
    echo "[entrypoint]   docker compose exec app npx prisma db push --accept-data-loss" >&2
  fi
fi

# Cache hygiene: `.next-dev` (Turbopack) tumbuh sampai ~10 GB; saat volume
# penuh `next dev` keluar dengan kode 0 tanpa pesan dan restart-loop menyajikan
# halaman setengah mati (lihat AGENTS.md). Bersihkan di sini — sebelum server
# start — hanya bila melewati 8 GB, supaya start normal tidak membayar harga
# cache dingin setiap kali.
if [ -d /app/.next-dev ]; then
  cache_mb="$(du -sm /app/.next-dev 2>/dev/null | cut -f1)"
  case "$cache_mb" in
    ''|*[!0-9]*) cache_mb=0 ;;
  esac
  if [ "$cache_mb" -gt 8192 ]; then
    echo "[entrypoint] WARNING: .next-dev cache ${cache_mb} MB > 8 GB; clearing before start…" >&2
    rm -rf /app/.next-dev/* 2>/dev/null || true
  fi
fi

# Turbopack (Next 16) mendaftarkan watch ke path virtual
# `.next-internal/server/app/**` yang tidak pernah dimaterialkan ke disk
# (output dev hidup di memori/.next-dev), jadi watcher polling meneriakkan
# "watch error ... NotFound" untuk setiap rute — ±19% log dev. Buat
# kerangka direktorinya dari pohon src/app supaya watch-nya berhasil dan
# diam. Idempoten; direktori kosong tidak dilacak git (lihat .gitignore).
if [ -d /app/src/app ]; then
  mkdir -p /app/.config
  ( cd /app/src/app && find . -type d | while IFS= read -r d; do
      mkdir -p "/app/.next-internal/server/app/$d" "/app/.next-internal/server/app/$d/page" 2>/dev/null || true
    done )
fi

# Drop privileges for the actual dev server.
if [ "$(id -u)" = "0" ]; then
  exec su-exec nextjs "$@"
fi
exec "$@"
