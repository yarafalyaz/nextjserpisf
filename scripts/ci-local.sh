#!/usr/bin/env bash
# =============================================================================
# Local CI/CD Pipeline — silengkap (YaraERP Next.js)
# =============================================================================
# Menjalankan pipeline pra-merge secara lokal (lint → type → unit → build →
# DB → E2E). Gate E2E akhir pra-merge: GitHub Actions hanya menjalankan
# lint, unit, build produksi, dan DB integration di MySQL — E2E browser
# (Playwright) TIDAK jalan di GitHub Actions, jadi hasil lokal inilah
# bukti E2E untuk PR. Lampirkan SHA + status tree di bawah ke PR.
#
# Usage:
#   DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/DB_TES' ./scripts/ci-local.sh
#   DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/DB_TES' npm run ci
#   ./scripts/ci-local.sh --skip-e2e   # Skip E2E (tidak butuh DATABASE_URL)
#   DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/DB_TES' ./scripts/ci-local.sh --e2e-only
#
# Prerequisites (mode E2E / full):
#   - Node.js ≥ 20 (lihat `engines` di package.json untuk versi yang dipakai repo)
#   - MySQL 8 berjalan, dengan database KHUSUS tes yang boleh di-reset
#     (migrate + seed menulis ulang isinya). Jangan pakai database dev/prod.
#   - DATABASE_URL wajib diset eksplisit di environment sebelum menjalankan
#     skrip (lihat contoh di atas). Skrip ini TIDAK membaca `.env` untuk
#     dirinya sendiri; nilai dari `.env` saja tidak cukup. Prisma memang
#     membaca `.env` lewat prisma.config.ts, tetapi server standalone dan
#     langkah lain di skrip ini memakai environment proses. Jangan hardcode
#     kredensial di skrip/command yang dicommit.
#   - Database bernama persis `silengkap` ditolak (diduga DB dev/prod).
#   - Tree bersih TIDAK diwajibkan; skrip mencatat commit SHA
#     (`git rev-parse --short HEAD`) dan status dirty
#     (`git status --porcelain`) di awal dan di summary supaya hasil bisa
#     dilampirkan ke PR dan tahu persis kode apa yang dites.
#   - Playwright browsers terinstall (npx playwright install chromium)
#
# Perintah Playwright standar (`playwright test`) menjalankan auth setup
# (project `setup`, e2e/auth.setup.ts) lalu project `chromium` dan
# `mobile-chrome` sesuai playwright.config.ts — tanpa shard lokal.
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
E2E_PORT="${E2E_PORT:-4101}"
LOG_DIR="$PROJECT_DIR/.ci-logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Mirror the deployment timezone (docker-compose sets TZ=Asia/Jakarta). Running
# the pipeline in UTC hides date bugs where a local-time derivation differs from
# the UTC one - e.g. report presets and the "today" default of create forms were
# off by one day only east of UTC. Override with TZ=UTC ... if ever needed.
export TZ="${TZ:-Asia/Jakarta}"

SKIP_E2E=false
E2E_ONLY=false

for arg in "$@"; do
  case $arg in
    --skip-e2e) SKIP_E2E=true ;;
    --e2e-only) E2E_ONLY=true ;;
    --help|-h)
      echo "Usage: ./scripts/ci-local.sh [--skip-e2e|--e2e-only|--help]"
      exit 0
      ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
step_count=0
total_steps=6

if $SKIP_E2E; then total_steps=4; fi
if $E2E_ONLY; then total_steps=2; fi

step() {
  step_count=$((step_count + 1))
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}[${step_count}/${total_steps}] $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

pass() {
  echo -e "  ${GREEN}✔ $1${NC}"
}

fail() {
  echo -e "  ${RED}✖ $1${NC}"
  echo -e "  ${YELLOW}Log: $2${NC}"
}

elapsed() {
  local start=$1
  local end=$(date +%s)
  echo "$((end - start))s"
}

cleanup() {
  # Kill next server if we started one
  if [[ -n "${NEXT_PID:-}" ]]; then
    kill "$NEXT_PID" 2>/dev/null || true
    wait "$NEXT_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Setup ─────────────────────────────────────────────────────────────────────
cd "$PROJECT_DIR"
mkdir -p "$LOG_DIR"

# Informasi commit yang dites — laporkan apa adanya (tree bersih tidak
# diwajibkan) supaya log bisa dilampirkan ke PR.
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'tidak-diketahui')"
GIT_DIRTY=false
GIT_STATUS="$(git status --porcelain 2>/dev/null || true)"
if [[ -n "$GIT_STATUS" ]]; then GIT_DIRTY=true; fi

# ── Guard DATABASE_URL (hanya mode yang menyentuh DB/E2E) ────────────────────
# `--skip-e2e` tidak butuh DB. Mode lain wajib DATABASE_URL eksplisit dari
# environment; skrip tidak membaca `.env` untuk dirinya (lihat header).
if ! $SKIP_E2E; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo -e "${RED}✖ DATABASE_URL belum diset.${NC}" >&2
    echo "  E2E lokal wajib memakai database khusus tes yang boleh di-reset (MySQL 8)." >&2
    echo "  Jangan pakai database dev/prod. Contoh:" >&2
    echo "    DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/DB_TES' ./scripts/ci-local.sh" >&2
    echo "  Atau jalankan tanpa E2E: ./scripts/ci-local.sh --skip-e2e" >&2
    exit 1
  fi
  # Nama database = segmen path URL setelah host:port, sebelum `?`.
  if [[ "$DATABASE_URL" =~ ^[a-zA-Z][a-zA-Z0-9+.-]*://[^/]+/([^/?]+) ]]; then
    DB_NAME="${BASH_REMATCH[1]}"
  else
    echo -e "${RED}✖ DATABASE_URL tidak memuat nama database.${NC}" >&2
    echo "  Format wajib: mysql://USER:PASSWORD@HOST:3306/DB_TES" >&2
    exit 1
  fi
  if [[ "$DB_NAME" == "silengkap" ]]; then
    echo -e "${RED}✖ DATABASE_URL menunjuk database 'silengkap' — ditolak.${NC}" >&2
    echo "  Diduga database dev/prod. Pakai database khusus tes yang boleh di-reset." >&2
    exit 1
  fi
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     🚀 Local CI/CD Pipeline — silengkap (YaraERP)      ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Timestamp : ${TIMESTAMP}                        ║${NC}"
echo -e "${CYAN}║  Node      : $(node -v | tr -d '\n')                              ║${NC}"
echo -e "${CYAN}║  Mode      : $(if $SKIP_E2E; then echo 'Skip E2E'; elif $E2E_ONLY; then echo 'E2E Only'; else echo 'Full Pipeline'; fi)                          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo -e "  Commit     : ${GIT_SHA}"
if $GIT_DIRTY; then
  echo -e "  Tree       : ${YELLOW}dirty (ada perubahan belum commit)${NC}"
  echo "$GIT_STATUS" | sed 's/^/    /'
else
  echo -e "  Tree       : bersih"
fi
if ! $SKIP_E2E; then
  # Hanya nama database — jangan pernah cetak kredensial/host dari URL.
  echo -e "  Database   : ${DB_NAME} (khusus tes, boleh di-reset)"
fi

PIPELINE_START=$(date +%s)
RESULTS=()

# ── Preflight install ─────────────────────────────────────────────────────────
# Tolak node_modules/node_modules sampah + pastikan auth ter-resolve sebelum
# stage mahal jalan (insiden 2026-10-22). Lewati di mode --e2e-only: stage
# build tidak jalan di sana.
if ! $E2E_ONLY; then
  if ! node scripts/preflight-node-modules.mjs; then
    echo -e "${RED}✖ Preflight install gagal — pipeline berhenti.${NC}" >&2
    exit 1
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 1: Lint
# ══════════════════════════════════════════════════════════════════════════════
if ! $E2E_ONLY; then

step "ESLint"
STAGE_START=$(date +%s)
LINT_LOG="$LOG_DIR/lint_${TIMESTAMP}.log"

if node_modules/.bin/eslint src/ --max-warnings=0 > "$LINT_LOG" 2>&1; then
  pass "Lint passed ($(elapsed $STAGE_START))"
  RESULTS+=("${GREEN}✔ Lint${NC}")
else
  fail "Lint failed ($(elapsed $STAGE_START))" "$LINT_LOG"
  RESULTS+=("${RED}✖ Lint${NC}")
  echo -e "  ${YELLOW}Lanjut ke step berikutnya...${NC}"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 2: TypeScript Type Check
# ══════════════════════════════════════════════════════════════════════════════
step "TypeScript Type Check"
STAGE_START=$(date +%s)
TSC_LOG="$LOG_DIR/tsc_${TIMESTAMP}.log"

if node_modules/.bin/tsc --noEmit > "$TSC_LOG" 2>&1; then
  pass "Type check passed ($(elapsed $STAGE_START))"
  RESULTS+=("${GREEN}✔ TypeScript${NC}")
else
  fail "Type check failed ($(elapsed $STAGE_START))" "$TSC_LOG"
  RESULTS+=("${RED}✖ TypeScript${NC}")
  echo ""
  echo -e "  ${YELLOW}Top errors:${NC}"
  head -20 "$TSC_LOG" | sed 's/^/    /'
  echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 3: Unit & Integration Tests (Vitest)
# ══════════════════════════════════════════════════════════════════════════════
step "Unit & Integration Tests (Vitest)"
STAGE_START=$(date +%s)
UNIT_LOG="$LOG_DIR/unit_${TIMESTAMP}.log"

if node_modules/.bin/vitest run --reporter=verbose > "$UNIT_LOG" 2>&1; then
  pass "Unit tests passed ($(elapsed $STAGE_START))"
  RESULTS+=("${GREEN}✔ Unit Tests${NC}")
else
  fail "Unit tests failed ($(elapsed $STAGE_START))" "$UNIT_LOG"
  RESULTS+=("${RED}✖ Unit Tests${NC}")
  echo ""
  tail -30 "$UNIT_LOG" | sed 's/^/    /'
  echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 4: Build
# ══════════════════════════════════════════════════════════════════════════════
step "Next.js Production Build"
STAGE_START=$(date +%s)
BUILD_LOG="$LOG_DIR/build_${TIMESTAMP}.log"

if npm run build > "$BUILD_LOG" 2>&1; then
  pass "Build succeeded ($(elapsed $STAGE_START))"
  RESULTS+=("${GREEN}✔ Build${NC}")
else
  fail "Build failed ($(elapsed $STAGE_START))" "$BUILD_LOG"
  RESULTS+=("${RED}✖ Build${NC}")
  echo ""
  echo -e "  ${YELLOW}Build errors:${NC}"
  grep -i "error" "$BUILD_LOG" | tail -15 | sed 's/^/    /'
  echo ""

  if ! $SKIP_E2E; then
    echo -e "  ${RED}Build gagal — E2E tests di-skip.${NC}"
    SKIP_E2E=true
  fi
fi

fi # end of !E2E_ONLY

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 5: Prisma Generate & DB Check
# ══════════════════════════════════════════════════════════════════════════════
if ! $SKIP_E2E; then

step "Database & Prisma Check"
STAGE_START=$(date +%s)
DB_LOG="$LOG_DIR/db_${TIMESTAMP}.log"

DB_OK=true

# Prisma generate
if node_modules/.bin/prisma generate > "$DB_LOG" 2>&1; then
  pass "Prisma generate OK"
else
  fail "Prisma generate failed" "$DB_LOG"
  DB_OK=false
fi

# Terapkan migrasi yang sudah ada (bukan `db push`): rantai migrasi
# diverifikasi mereproduksi skema dari DB kosong (drift 0, lihat
# `npm run db:check-migrations`). `db push` menutupi ketidaksesuaian skema vs
# migrasi; `migrate deploy` membuatnya GAGAL KERAS. Urutan di mode full:
# build produksi (stage 4) jalan lebih dulu, baru DB/E2E di sini.
if $DB_OK; then
  if node_modules/.bin/prisma migrate deploy >> "$DB_LOG" 2>&1; then
    pass "DB migrated"
  else
    fail "DB migrate failed" "$DB_LOG"
    DB_OK=false
  fi
fi

# Seed fixture E2E — tanpa ini auth setup (e2e/auth.setup.ts) dan spec yang
# butuh data seed gagal sebelum tes apa pun jalan. Sama seperti alur CI
# lama: seed utama lalu seed-remaining-e2e. Database khusus tes boleh
# di-reset, jadi seed di sini aman; jangan arahkan ke DB dev/prod.
# `SEED_ADMIN_PASSWORD` default `Yara1234` harus sama dengan default
# `E2E_PASSWORD` di e2e/auth.setup.ts; sesuaikan keduanya bila mengubah.
if $DB_OK; then
  if ALLOW_DEMO_SEED=true SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-Yara1234}" node_modules/.bin/tsx prisma/seed.ts >> "$DB_LOG" 2>&1 \
     && node_modules/.bin/tsx scripts/seed-remaining-e2e.ts >> "$DB_LOG" 2>&1; then
    pass "DB seeded (fixture E2E)"
  else
    fail "DB seed failed" "$DB_LOG"
    DB_OK=false
  fi
fi

if $DB_OK; then
  RESULTS+=("${GREEN}✔ DB Check${NC}")
else
  RESULTS+=("${RED}✖ DB Check${NC}")
  echo -e "  ${RED}DB tidak siap — E2E tests di-skip.${NC}"
  SKIP_E2E=true
fi

fi # end of DB stage (!SKIP_E2E)

if ! $SKIP_E2E; then

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 6: E2E Tests (Playwright)
# ══════════════════════════════════════════════════════════════════════════════
step "E2E Tests (Playwright)"
STAGE_START=$(date +%s)
E2E_LOG="$LOG_DIR/e2e_${TIMESTAMP}.log"

# Pastikan browsers terinstall
if ! node_modules/.bin/playwright install --dry-run chromium > /dev/null 2>&1; then
  echo -e "  ${YELLOW}Installing Playwright browsers...${NC}"
  node_modules/.bin/playwright install chromium >> "$E2E_LOG" 2>&1
fi

# Run E2E — satu perintah standar tanpa shard lokal. Sesuai
# playwright.config.ts, ini menjalankan project `setup` (auth,
# e2e/auth.setup.ts, dependency dari project lain) lalu `chromium` dan
# `mobile-chrome`.
export E2E_PORT
export CI=true

if node_modules/.bin/playwright test --reporter=list > "$E2E_LOG" 2>&1; then
  pass "E2E tests passed ($(elapsed $STAGE_START))"
  RESULTS+=("${GREEN}✔ E2E Tests${NC}")
else
  fail "E2E tests failed ($(elapsed $STAGE_START))" "$E2E_LOG"
  RESULTS+=("${RED}✖ E2E Tests${NC}")
  echo ""
  # Show summary
  grep -E "(passed|failed|skipped)" "$E2E_LOG" | tail -5 | sed 's/^/    /'
  echo ""
  echo -e "  ${YELLOW}Report: npx playwright show-report${NC}"
fi

fi # end of !SKIP_E2E

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Pipeline Summary ($(elapsed $PIPELINE_START) total)${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo ""

for result in "${RESULTS[@]}"; do
  echo -e "  $result"
done

echo ""
# SHA + status tree tercatat di summary juga, supaya log di .ci-logs bisa
# dilampirkan ke PR sebagai bukti gate untuk commit persis ini.
echo -e "  Commit     : ${GIT_SHA}"
if $GIT_DIRTY; then
  echo -e "  Tree       : ${YELLOW}dirty (ada perubahan belum commit)${NC}"
else
  echo -e "  Tree       : bersih"
fi
echo -e "  ${BLUE}Logs: ${LOG_DIR}/${NC}"
echo ""

# Exit with failure if any stage failed
for result in "${RESULTS[@]}"; do
  if echo -e "$result" | grep -q "✖"; then
    echo -e "${RED}Pipeline FAILED${NC}"
    exit 1
  fi
done

echo -e "${GREEN}${BOLD}Pipeline PASSED ✔${NC}"
exit 0
