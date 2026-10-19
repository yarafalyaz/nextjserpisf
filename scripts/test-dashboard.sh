#!/bin/bash
node_modules/.bin/playwright test e2e/dashboard.spec.ts e2e/sales-flow.spec.ts e2e/master-gudang-crud.spec.ts --project=chromium
