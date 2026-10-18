<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repository Guidelines

YaraERP (`silengkap`) — integrated ERP on Next.js 16 (App Router), Prisma 7/MariaDB, NextAuth v5, Tailwind 4: ~428 pages (`src/app/**/page.tsx`), 300 unit-test files, 41 E2E specs. Angka-angka ini diukur pada Oktober 2026; kalau menyimpang jauh, ukur ulang daripada memercayainya (mis. `find src/app -name page.tsx | wc -l`, `ls e2e/*.spec.ts | wc -l`).

## Project Structure & Module Organization

- `src/app/(dashboard)/<modul>/` — pages behind Indonesian slugs (`master`, `penjualan`, `pembelian`, `inventaris`, `produksi`, `sdm`, `keuangan`, `laporan`, `aset`, `crm`, `pengaturan`); `(auth)` holds login, `src/app/api/` the route handlers.
- `src/actions/*.actions.ts` — `"use server"` actions, one file per module.
- `src/lib/hooks/*.hook.ts` — Laravel-observer replacements; take an optional `txClient` to join a caller's transaction.
- `src/lib/services/*.service.ts` — backend engines invoked from actions and hooks (FIFO costing, journals, period lock, document sequence).
- `src/lib/validations/*.schemas.ts` — Zod schemas; `src/lib/utils/` — `safe-parse`, `status-labels`, `document-number`.
- `src/components/ui/` (shared), `src/components/ui/shadcn/` (primitives), `prisma/` (schema + `seed.ts`), `scripts/` (seeds, `ci-local.sh`).
- Tests sit in `__tests__/` beside the code; browser tests in `e2e/`. `src/proxy.ts` replaces Next's `middleware.ts`.

## Build, Test, and Development Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Turbopack dev server on `:3001` |
| `npm run build` / `npm start` | Production build; serve the standalone output (`next start` is unsupported with `output: "standalone"`) |
| `npm run db:generate` \| `db:push` \| `db:seed` \| `db:studio` | Prisma client, schema sync, seed, Studio |
| `npm run db:check-migrations` | Verify the migration chain reproduces `schema.prisma` (runs entirely in a scratch DB it creates and drops; needs `MIGRATION_CHECK_URL` pointing at a user with `CREATE DATABASE`; drift must be 0) |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` / `npm run test:e2e` | Vitest; Playwright (needs seeded DB + build, port `4101`) |
| `npm run ci:quick` / `npm run ci` | Local pipeline lint → types → unit → build (+ E2E); logs in `.ci-logs/` |

Playwright serves the app through `scripts/prepare-standalone.mjs` + `node .next/standalone/server.js`
— the same runtime as the Docker image — so E2E exercises production behaviour. Run the pipeline
with `TZ=Asia/Jakarta` (CI does): the app and DB are deployed in WIB, and UTC hides the whole class
of off-by-one-day bugs (report presets, the "today" default of every create form).

## Coding Style & Naming Conventions

- No Prettier config — match surrounding code: 2-space indent, double quotes, semicolons.
- ESLint flat config layers `next/core-web-vitals` and `next/typescript`; `no-explicit-any` and `no-unused-vars` are off.
- Alias `@/*` → `src/*`; kebab-case filenames suffixed by role (`master.actions.ts`, `stock-adjustment.hook.ts`, `sales.schemas.ts`).
- Server Components first; add `"use client"` only where interactivity requires it.
- **Report URLs carry everything in the path, never in the query string**: `/laporan/<laporan>/<periode>[/<kunci>/<nilai>…]`, e.g. `/laporan/pajak/2026-10`, `/laporan/kartu-stok/2026-10/barang/busi-iridium`, `/laporan/valuasi-stok/gudang/gudang-utama`. The period comes from `parseReportPeriod` and the filters are key/value pairs (`parseReportFilters`), so omitting a filter needs no placeholder and order never matters. A report page reads them through the shared helpers only — `reportPeriodFromRoute` / `splitReportSegments` (and writes them with `buildReportHref`) — because those also hold the "old `?tanggalMulai=` links still work" rule; `src/__tests__/report-url-convention.test.ts` fails if a report reads a period/entity param without them. List-page filters (search, pagination, status) stay query params — that is where they belong.

## Testing Guidelines

- Vitest: `src/**/__tests__/*.test.ts`, named after the unit (`uom.test.ts`, `trial-balance.test.ts`), one behaviour per `it`.
- DB-backed suites require `RUN_DB_INTEGRATION=1` (e.g. `inventory-integration.test.ts`) and skip otherwise.
- Playwright `e2e/*.spec.ts` authenticates once via `auth.setup.ts` → `e2e/.auth/user.json`; the `mobile-chrome` project covers small screens, and `e2e/utils/desktop-only.ts` opts specs out.
- Every bug fix ships with a regression test.
- **Static "ratchet" guards** fail when a whole class of defect is re-introduced: `schema-usage`
  (every scalar field **and every model** in `schema.prisma` must be referenced by code),
  `navigation-targets` (every nav href must resolve to a page — no exceptions list),
  `silent-failure` (no empty `catch {}` and no silent `.catch(() => …)` in production code),
  `wired-transition-actions` (which server actions must — and must not — be reachable from the UI).
  Where a guard keeps a list of accepted exceptions (`schema-usage`, `silent-failure`,
  `wired-transition-actions`), that list is checked **both ways** — so a fix that removes the cause
  *also* fails until the list is pruned, on purpose. `docs/AUDIT-SCHEMA.md` explains what each one
  encodes, with the evidence and the corrections.
- Running Playwright against the **local Docker DB** (CI uses a throwaway MariaDB, so this needs
  explicit wiring): point `DATABASE_URL` at `127.0.0.1:3309` and, when the local admin is not the
  seed default (`admin@erp.yarasoft.net`), override the credentials.
  ```sh
  export DATABASE_URL='mysql://silengkap_user:silengkap_pass123@127.0.0.1:3309/silengkap'
  npm run build   # the webServer serves .next/standalone, not the dev server
  E2E_EMAIL=admin@isf.co.id E2E_PASSWORD=Yara1234 npx playwright test --project=chromium
  ```
- **E2E serves a PREBUILT bundle**: Playwright runs `.next/standalone`, not the dev server, so after
  any change to `prisma/schema.prisma` you must `npm run build` **before** running the suite — otherwise
  the bundled Prisma Client is stale and pages fail with `driverAdapterError: ColumnNotFound` for
  columns that no longer exist. That looks exactly like a code bug (pajak/approval screens plus the
  status route) and cost a full debugging round; the fix is one rebuild.
- Four specs read **demo data** and fail (not flake) on an empty/dev DB: `/produksi/qc/inspeksi`
  (needs a `released` QC checklist with items), `customer-vehicle-registry` (vehicle variants),
  `data-table-mobile-cards` (`items`), `finance-journal` trial balance (posted journals). CI creates
  it with `npx tsx prisma/seed.ts` + `npx tsx scripts/seed-remaining-e2e.ts` — but that inserts demo
  master data, so run it against a scratch database rather than a hand-kept one.
- Specs that create their own records must clean up after themselves; a quick-add entry inside a
  combobox must never be a `role="option"` (see `src/components/ui/combobox.tsx`), or "select the
  first option" opens a dialog instead of picking a row.

## Commit & Pull Request Guidelines

- `type(scope): Imperative summary` using `fix`, `refactor`, `test`, `chore`, `docs`, `feat`, `perf`; scopes name a module or layer (`sales`, `inventory`, `hooks`, `audit`, `e2e`).
- Bodies cover cause, fix, and blast radius, closing with evidence such as `Tests: 2677 -> 2680 (3 new), tsc clean, lint clean.`
- Commits land directly on `main`; no PR template exists. CI (`.github/workflows/ci.yml`) must pass lint, `tsc`, Vitest, then 4-shard Playwright. PRs state summary, linked issue, test evidence, and UI screenshots.

## Security & Configuration Tips

- Never commit `.env`; copy `.env.example` and set `DATABASE_URL` plus `AUTH_SECRET`. `src/lib/env.ts` validates configuration at runtime with Zod.
- Set `TRUSTED_PROXY=1` **only** when every request passes through a proxy/Cloudflare that overwrites client-IP headers; otherwise `getClientIp()` ignores them (spoofable headers must never mint a fresh rate-limit bucket).
- Rate limits, CSP, and security headers live in `src/proxy.ts`. `/api/cron/*` is guarded by `CRON_SECRET`.
- New server actions must call `requirePermission()`; dated documents must also call `assertPeriodOpen()`. Keep `src/__tests__/permission-seed-parity.test.ts` passing — it fails when code enforces a permission that `prisma/seed.ts` never creates.
- **`prisma migrate deploy` refuses to run against the dev DB** — dev is provisioned by `db push`, so it has no `_prisma_migrations` history and Prisma exits with `P3005` ("The database schema is not empty") instead of replaying anything. Observed behaviour: nothing is applied and nothing is half-recorded — it is a clean refusal, so do not "fix" it by editing the dev DB. To provision from migrations, baseline first (`prisma migrate resolve --applied <migration>`, as `docs/AUDIT-REPORT.md` describes for production) or use a fresh database; to merely verify the migrate chain, run `npm run db:check-migrations` (creates and drops its own scratch DB).
- The dev container's `node_modules` is an anonymous volume, so the Prisma Client baked into the image goes stale the moment `prisma/schema.prisma` changes — queries then fail at runtime with "The column X does not exist in the current database" even though the migration ran. `docker/entrypoint.dev.sh` re-runs `prisma generate` on every container start to prevent this. If you edit the schema, recreate the container (`docker compose up -d --force-recreate app`); after `docker compose build` the new entrypoint is baked in.
- Dev and prod keep separate build caches: `next dev` writes to `.next-dev` (next.config.ts `distDir`), the production build uses `.next`. docker-compose mounts the anonymous volume at `/app/.next-dev`, **not** `/app/.next` — mounting the latter makes Docker apply a `deny delete` ACL to the host `.next`, and `next build` (which starts with `rm -rf .next`) then fails with "Permission denied". The production `next build` runs with `tsconfig.build.json` so it never type-checks the dev cache under `.next-dev`.
- The `.next-dev` Turbopack cache grows to ~10 GB on a 62 GB volume. When it fills (observed at 88%, ~7 GB left), `next dev` **exits with code 0 and no error message** and `restart: unless-stopped` brings it straight back, so pages intermittently fail mid-session with `ERR_CONNECTION_RESET` — it looks like a code bug but is not. Check with `docker compose exec app df -h /app/.next-dev`; clear it with `docker compose exec -T app sh -c "rm -rf /app/.next-dev/*"` + `docker compose restart app` (a `docker compose run --rm` gets a *fresh* anonymous volume and clears nothing).
- Docker Desktop on macOS does not deliver host-side **deletions** to the container's file watcher, so moving or deleting a route file leaves the container serving the old path: `GET` returns 500 with `Could not parse module '[project]/<old path>/page.tsx', file not found` (hit when `laporan/kartu-stok/page.tsx` moved into `[[...segments]]/`). `docker compose restart app` re-scans and clears it — editing an existing file in place is picked up normally, only moves/deletes need the restart. If a restart leaves the route manifest *inconsistent* instead (the moved route 404s **and** unrelated catch-all API routes like `/api/auth/csrf` start returning 404, which shows up in the browser as `ClientFetchError: Unexpected token '<'`), a restart is not enough — clear the dev cache: `docker compose exec -T app sh -c "rm -rf /app/.next-dev/*"` + `docker compose restart app`. Verify with `curl -s -o /dev/null -w '%{http_code}' http://localhost:3005/api/auth/csrf` (must be 200, not 404).

## Agent-Specific Instructions

- Read `node_modules/next/dist/docs/01-app/` before touching routing, caching, or config APIs — v16 renamed middleware to `src/proxy.ts`. `docs/legacy/skill.md` maps Laravel concepts onto this codebase; `README.md` covers setup.
- Always work through the project MCP servers (`.mcp.json`): `next-devtools` (`nextjs_index` to discover the running dev server, `nextjs_docs` for version-accurate docs, `nextjs_call` for runtime internals, `browser_eval` for browser checks) and `shadcn` (component search/registry) — never rely on training-data recollection of Next.js APIs.
- Use the installed Next.js skills in `.commandcode/skills/` when the task matches: `next-dev-loop` to verify a change actually runs in the browser, `next-bundle-optimizer` for client-bundle weight, `next-cache-components-adoption` / `next-cache-components-optimizer`, `next-partial-prefetching-adoption` / `next-partial-prefetching-optimizer`. Update them with `npx skills update`.
- The agent shell exports `DATABASE_URL`, `NODE_ENV`, `AUTH_SECRET`, `NEXTAUTH_URL` and `CRON_SECRET` from a session-start snapshot of `.env`, and Next.js does **not** override env vars that already exist in `process.env`. Running plain `npm run dev` therefore ignores `.env` edits: point it at the Docker DB on `127.0.0.1:3309` (`silengkap_user` / `silengkap_pass123` / `silengkap`) with `env -u NODE_ENV -u DATABASE_URL npm run dev`. Leaving `NODE_ENV=production` inherited also triggers the "non-standard NODE_ENV" warning.
