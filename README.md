# YaraERP - Next.js App Router

Sistem ERP terintegrasi yang dibangun dengan Next.js 16 App Router, Prisma 7, dan MySQL.

## Tech Stack

- **Framework**: Next.js 16 (App Router + Turbopack)
- **Language**: TypeScript 5
- **ORM**: Prisma 7 (MySQL via @prisma/adapter-mariadb)
- **Auth**: NextAuth v5 (Credentials + JWT)
- **UI**: TailwindCSS 4 + shadcn/ui (CVA)
- **Forms**: React Hook Form + Zod
- **State**: Zustand + TanStack Query
- **Charts**: Recharts
- **Testing**: Vitest + Playwright

## Getting Started

### Prerequisites

- Node.js 20+
- MySQL 8.0+
- npm

### Installation

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your database credentials

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed database (creates admin user, roles, permissions, COA)
npm run db:seed

# Start development server
npm run dev
```

### Default Login

- **Email**: admin@yaraerp.app
- **Password**: password123

## Modules (41 Routes)

| #   | Module        | Description                                                |
| --- | ------------- | ---------------------------------------------------------- |
| 1   | Dashboard     | KPI Cards, Recent Invoices, Low Stock Alerts               |
| 2   | Master Data   | Customers, Vendors, Items, Warehouses, Employees, Accounts |
| 3   | Sales         | Quotation → DP → SO → Invoice → Payment → Return           |
| 4   | Purchase      | PR → PO → Goods Receipt → Return                           |
| 5   | Inventory     | Stock Moves, Adjustments, Transfers, Material Issues       |
| 6   | Manufacturing | Work Orders, Production Orders                             |
| 7   | HRM           | Attendance, Leave, Overtime, Payroll                       |
| 8   | Finance       | Journals, Expenses, Petty Cash, Bank Reconciliation        |
| 9   | CRM           | Leads, Tickets                                             |
| 10  | Assets        | Asset Management                                           |
| 11  | Reports       | Balance Sheet, P&L, Trial Balance                          |
| 12  | Settings      | Company Config, Account Mapping                            |

## Key Features

- **FIFO Inventory Costing** with row-level locking
- **Double-Entry Accounting** with balance validation
- **Atomic Document Numbering** (concurrency-safe)
- **Observer Pattern** via explicit hooks (13 hooks)
- **RBAC** with 70+ permissions
- **Responsive Design** (mobile-first)

## Scripts

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run db:push      # Push schema to DB
npm run db:seed      # Seed database
npm run db:studio    # Open Prisma Studio
npm run db:generate  # Regenerate Prisma client
npm run test         # Run unit tests (280+ tests)
npm run test:e2e     # Run E2E tests (Playwright)
```

## CI/CD

GitHub Actions pipeline runs on every push to `main`:

- **Verify job**: TypeScript check, ESLint, unit tests
- **E2E job**: MySQL service, DB migration, Playwright (4 shards)

## Code Quality

- 280+ unit tests (Vitest), 82%+ statement coverage
- E2E tests covering all authenticated modules
- Zero circular dependencies
- Zero `console.log` in client code
- Runtime env validation (Zod)
- Security headers via proxy (CSP, HSTS, X-Frame-Options)
- Rate limiting on auth, upload, and API routes
