#!/bin/sh
# Backup database MySQL (container `db`) ke backups/db-<timestamp>.sql.gz.
#
# Kenapa ada: sampai 25 Okt 2026 repo tidak punya satu pun backup teruji —
# satu-satunya salinan data adalah volume Docker itu sendiri. Script ini
# sengaja membosankan: mysqldump satu transaksi, gzip, lalu verifikasi
# integritas arsip + hitung tabel di dalamnya sebelum mengaku sukses.
#
# Pakai:  ./scripts/backup-db.sh [nama-db]     (default: $DB_NAME / silengkap)
# Restore drill (ke DB kosong terpisah, JANGAN ke DB aktif):
#   docker compose exec -T db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
#     -e "CREATE DATABASE silengkap_restore;"
#   gzip -dc backups/db-<ts>.sql.gz | docker compose exec -T db \
#     mysql -uroot -p"$MYSQL_ROOT_PASSWORD" silengkap_restore
set -eu

DB_NAME="${1:-${DB_NAME:-silengkap}}"
ROOT_PW="${MYSQL_ROOT_PASSWORD:-root_password_change_me}"
TS="$(TZ=Asia/Jakarta date +%Y%m%d-%H%M%S)"
OUT_DIR="backups"
OUT="$OUT_DIR/db-$DB_NAME-$TS.sql.gz"

mkdir -p "$OUT_DIR"
echo "[backup] mysqldump $DB_NAME -> $OUT"
docker compose exec -T db mysqldump -uroot -p"$ROOT_PW" \
  --single-transaction --routines --triggers --events \
  --set-gtid-purged=OFF "$DB_NAME" | gzip > "$OUT"

gzip -t "$OUT"
TABLES="$(zgrep -c '^CREATE TABLE' "$OUT")"
SIZE="$(du -h "$OUT" | cut -f1)"
echo "[backup] OK: $OUT ($SIZE, $TABLES tabel)"
