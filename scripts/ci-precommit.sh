#!/usr/bin/env bash
# =============================================================================
# Pre-commit check — fast pipeline (lint + typecheck + unit tests)
# =============================================================================
# Bisa dipasang sebagai git hook:
#   cp scripts/ci-precommit.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cd "$(git rev-parse --show-toplevel)"

echo "🔍 Running pre-commit checks..."

# 1. Lint staged files (quick)
echo -n "  ESLint... "
if npx eslint src/ --quiet 2>/dev/null; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAIL${NC}"
  echo "Run: npm run lint"
  exit 1
fi

# 2. TypeScript
echo -n "  TypeScript... "
if npx tsc --noEmit 2>/dev/null; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAIL${NC}"
  echo "Run: npm run typecheck"
  exit 1
fi

# 3. Unit tests (fast, no coverage)
echo -n "  Unit tests... "
if npx vitest run --reporter=dot 2>/dev/null; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAIL${NC}"
  echo "Run: npm run test"
  exit 1
fi

echo -e "${GREEN}✔ All pre-commit checks passed${NC}"
