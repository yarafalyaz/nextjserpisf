#!/usr/bin/env bash
# E2E cleanup: remove .next/node_modules to prevent ENOTEMPTY build error
set -euo pipefail
rm -rf .next/node_modules 2>/dev/null || true
echo "ok: .next/node_modules cleaned"
