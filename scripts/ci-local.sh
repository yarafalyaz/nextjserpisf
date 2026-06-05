#!/usr/bin/env bash
# =============================================================================
# Local CI/CD Pipeline — silengkap (YaraERP Next.js)
# =============================================================================
# Menjalankan seluruh pipeline secara lokal tanpa GitHub Actions.
# Usage:
#   ./scripts/ci-local.sh          # Full pipeline (lint → type → unit → build → e2e)
#   ./scripts/ci-local.sh --skip-e2e   # Skip E2E (tidak butuh DB/server running)
#   ./scripts/ci-local.sh --e2e-only   # Hanya E2E tests
#
# Prerequisites:
#   - Node.js ≥ 20
#   - MySQL running dengan DATABASE_URL di .env
#   - Playwright browsers terinstall (npx playwright install chromium)
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
  if [ -n "${NEXT_PID:-}" ]; then
    kill "$NEXT_PID" 2>/dev/null || true
    wait "$NEXT_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Setup ─────────────────────────────────────────────────────────────────────
cd "$PROJECT_DIR"
mkdir -p "$LOG_DIR"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     🚀 Local CI/CD Pipeline — silengkap (YaraERP)      ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Timestamp : ${TIMESTAMP}                        ║${NC}"
echo -e "${CYAN}║  Node      : $(node -v | tr -d '\n')                              ║${NC}"
echo -e "${CYAN}║  Mode      : $(if $SKIP_E2E; then echo 'Skip E2E'; elif $E2E_ONLY; then echo 'E2E Only'; else echo 'Full Pipeline'; fi)                          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"

PIPELINE_START=$(date +%s)
RESULTS=()

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 1: Lint
# ══════════════════════════════════════════════════════════════════════════════
if ! $E2E_ONLY; then

step "ESLint"
STAGE_START=$(date +%s)
LINT_LOG="$LOG_DIR/lint_${TIMESTAMP}.log"

if npx eslint src/ --max-warnings=0 > "$LINT_LOG" 2>&1; then
  pass "Lint passed ($(elapsed $STAGE_START))"
  RESULTS+=("${GREEN}✔ Lint${NC}")
else
  # Retry with warnings allowed (non-blocking)
  if npx eslint src/ > "$LINT_LOG" 2>&1; then
    echo -e "  ${YELLOW}⚠ Lint passed with warnings ($(elapsed $STAGE_START))${NC}"
    RESULTS+=("${YELLOW}⚠ Lint (warnings)${NC}")
  else
    fail "Lint failed ($(elapsed $STAGE_START))" "$LINT_LOG"
    RESULTS+=("${RED}✖ Lint${NC}")
    echo -e "  ${YELLOW}Lanjut ke step berikutnya...${NC}"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 2: TypeScript Type Check
# ══════════════════════════════════════════════════════════════════════════════
step "TypeScript Type Check"
STAGE_START=$(date +%s)
TSC_LOG="$LOG_DIR/tsc_${TIMESTAMP}.log"

if npx tsc --noEmit > "$TSC_LOG" 2>&1; then
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

if npx vitest run --reporter=verbose > "$UNIT_LOG" 2>&1; then
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
if npx prisma generate > "$DB_LOG" 2>&1; then
  pass "Prisma generate OK"
else
  fail "Prisma generate failed" "$DB_LOG"
  DB_OK=false
fi

# Prisma db push (sync schema to DB without migration)
if $DB_OK; then
  if npx prisma db push --accept-data-loss >> "$DB_LOG" 2>&1; then
    pass "DB schema synced"
  else
    echo -e "  ${YELLOW}⚠ DB push failed (mungkin DB belum running)${NC}"
    echo -e "  ${YELLOW}  E2E tests mungkin akan error.${NC}"
  fi
fi

RESULTS+=("${GREEN}✔ DB Check${NC}")

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 6: E2E Tests (Playwright)
# ══════════════════════════════════════════════════════════════════════════════
step "E2E Tests (Playwright)"
STAGE_START=$(date +%s)
E2E_LOG="$LOG_DIR/e2e_${TIMESTAMP}.log"

# Pastikan browsers terinstall
if ! npx playwright install --dry-run chromium > /dev/null 2>&1; then
  echo -e "  ${YELLOW}Installing Playwright browsers...${NC}"
  npx playwright install chromium >> "$E2E_LOG" 2>&1
fi

# Run E2E
export E2E_PORT
export CI=true

if npx playwright test --reporter=list > "$E2E_LOG" 2>&1; then
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
