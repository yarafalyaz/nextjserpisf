<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repository Guidelines

YaraERP (`silengkap`) — integrated ERP on Next.js 16 (App Router), Prisma 7/MariaDB, NextAuth v5, Tailwind 4: ~337 pages, 164 unit-test files, 33 E2E specs.

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

## Testing Guidelines

- Vitest: `src/**/__tests__/*.test.ts`, named after the unit (`uom.test.ts`, `trial-balance.test.ts`), one behaviour per `it`.
- DB-backed suites require `RUN_DB_INTEGRATION=1` (e.g. `inventory-integration.test.ts`) and skip otherwise.
- Playwright `e2e/*.spec.ts` authenticates once via `auth.setup.ts` → `e2e/.auth/user.json`; the `mobile-chrome` project covers small screens, and `e2e/utils/desktop-only.ts` opts specs out.
- Every bug fix ships with a regression test.

## Commit & Pull Request Guidelines

- `type(scope): Imperative summary` using `fix`, `refactor`, `test`, `chore`, `docs`, `feat`, `perf`; scopes name a module or layer (`sales`, `inventory`, `hooks`, `audit`, `e2e`).
- Bodies cover cause, fix, and blast radius, closing with evidence such as `Tests: 2677 -> 2680 (3 new), tsc clean, lint clean.`
- Commits land directly on `main`; no PR template exists. CI (`.github/workflows/ci.yml`) must pass lint, `tsc`, Vitest, then 4-shard Playwright. PRs state summary, linked issue, test evidence, and UI screenshots.

## Security & Configuration Tips

- Never commit `.env`; copy `.env.example` and set `DATABASE_URL` plus `AUTH_SECRET`. `src/lib/env.ts` validates configuration at runtime with Zod.
- Set `TRUSTED_PROXY=1` **only** when every request passes through a proxy/Cloudflare that overwrites client-IP headers; otherwise `getClientIp()` ignores them (spoofable headers must never mint a fresh rate-limit bucket).
- Rate limits, CSP, and security headers live in `src/proxy.ts`. `/api/cron/*` is guarded by `CRON_SECRET`.
- New server actions must call `requirePermission()`; dated documents must also call `assertPeriodOpen()`. Keep `src/__tests__/permission-seed-parity.test.ts` passing — it fails when code enforces a permission that `prisma/seed.ts` never creates.

## Agent-Specific Instructions

- Read `node_modules/next/dist/docs/01-app/` before touching routing, caching, or config APIs — v16 renamed middleware to `src/proxy.ts`. `skill.md` maps Laravel concepts onto this codebase; `README.md` covers setup.
