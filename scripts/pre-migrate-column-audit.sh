#!/usr/bin/env bash
# Audit isi kolom SEBELUM migrasi DROP dijalankan di produksi.
# Baca-only: hanya SELECT COUNT/SUM, tidak menulis apa pun.
# Gagal (exit 1) bila ada kolom target berisi data non-default —
# artinya asumsi "kolom mati" salah untuk DB ini, JANGAN migrate.
#
# Pakai: DATABASE_URL='mysql://user:pass@host:3306/db' bash scripts/pre-migrate-column-audit.sh
# Di Compose produksi: kredensial yang SAMA dengan layanan migrate
# (DB_USER / DB_PASSWORD / DB_NAME dari .env — konsisten, tidak duplikat).
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL tidak diset." >&2
  exit 2
fi

# Ubah mysql://user:pass@host:port/db menjadi argumen mariadb/mysql client.
parse_url() {
  python3 - "$DATABASE_URL" <<'EOF'
import sys, urllib.parse
u = urllib.parse.urlparse(sys.argv[1])
print(u.username or "")
print(u.password or "")
print(u.hostname or "localhost")
print(u.port or 3306)
print(u.path.lstrip("/") or "")
EOF
}

DB_USER="$(parse_url | sed -n '1p')"
DB_PASS="$(parse_url | sed -n '2p')"
DB_HOST="$(parse_url | sed -n '3p')"
DB_PORT="$(parse_url | sed -n '4p')"
DB_NAME="$(parse_url | sed -n '5p')"

q() {
  # Klien: mariadb bila ada, mysql bila ada, atau via docker exec ke
  # kontainer DB (dipakai di laptop tanpa klien DB lokal).
  if command -v mariadb >/dev/null 2>&1; then
    MYSQL_PWD="$DB_PASS" mariadb -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -N -B -e "$1" "$DB_NAME"
  elif [ -n "${DB_CONTAINER:-}" ]; then
    docker exec "$DB_CONTAINER" mariadb -uroot "$DB_NAME" -N -B -e "$1"
  else
    MYSQL_PWD="$DB_PASS" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -N -B -e "$1" "$DB_NAME"
  fi
}

fail=0
check_column() {
  # $1 = tabel, $2 = kolom, $3 = kondisi "berisi data" (SQL boolean)
  local table="$1" col="$2" cond="$3"
  local exists
  exists=$(q "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '$table' AND column_name = '$col';")
  if [ "$exists" = "0" ]; then
    echo "SKIP  $table.$col: kolom sudah tidak ada."
    return
  fi
  local n
  n=$(q "SELECT COUNT(*) FROM \`$table\` WHERE $cond;")
  if [ "$n" != "0" ]; then
    echo "GAGAL $table.$col: $n baris berisi data — JANGAN jalankan migrate drop." >&2
    fail=1
  else
    echo "OK    $table.$col: kosong (0 baris berisi data)."
  fi
}

# 20261019000900 — balance selalu default 0.00 bila tak pernah ditulis.
check_column "bank_statement_lines" "balance" "balance IS NOT NULL AND balance != 0"
# 20261019001000 gelombang-2.
check_column "approval_workflow_steps" "can_skip" "can_skip = true"
check_column "bank_reconciliation_items" "cleared_date" "cleared_date IS NOT NULL"
check_column "bank_statement_lines" "matched_type" "matched_type IS NOT NULL AND matched_type != ''"

if [ "$fail" != "0" ]; then
  echo "Audit GAGAL — migrate drop DITOLAK untuk DB ini." >&2
  exit 1
fi
echo "Audit LULUS — kolom target kosong, migrate drop aman untuk DB ini."
