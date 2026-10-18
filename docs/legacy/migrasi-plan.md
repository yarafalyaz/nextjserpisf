# Plan: Implementasi Migrasi YaraERP ke Next.js App Router

## Strategi Migrasi

Migrasi dilakukan secara **bertahap (incremental)** dalam 8 fase. Setiap fase menghasilkan deliverable yang bisa di-test secara independen. Pendekatan: **bottom-up** — mulai dari database/ORM, lalu services, lalu UI.

---

## Fase 1: Foundation & Project Setup (Week 1)

### 1.1 Inisialisasi Project

```
npx -y create-next-app@latest ./ --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

### 1.2 Struktur Folder Target

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth layout group
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/              # Main app layout group
│   │   ├── layout.tsx            # Sidebar + Header
│   │   ├── page.tsx              # Dashboard
│   │   ├── master/               # Master Data pages
│   │   ├── sales/                # Sales module pages
│   │   ├── purchase/             # Purchase module pages
│   │   ├── inventory/            # Inventory module pages
│   │   ├── manufacturing/        # Manufacturing pages
│   │   ├── hrm/                  # HRM pages
│   │   ├── finance/              # Finance/Accounting pages
│   │   ├── crm/                  # CRM pages
│   │   ├── assets/               # Asset Management pages
│   │   ├── reports/              # Reports pages
│   │   └── settings/             # System Settings pages
│   ├── api/                      # API Routes (minimal, untuk webhooks/external)
│   └── layout.tsx                # Root layout
├── lib/                          # Shared utilities
│   ├── db/                       # Prisma client & helpers
│   │   └── prisma.ts
│   ├── services/                 # Business logic services
│   │   ├── inventory.service.ts
│   │   ├── journal.service.ts
│   │   ├── document-sequence.service.ts
│   │   ├── notification.service.ts
│   │   └── quotation-sync.service.ts
│   ├── hooks/                    # Model hooks (observer replacement)
│   │   ├── accounting.hook.ts
│   │   ├── down-payment.hook.ts
│   │   ├── goods-receipt.hook.ts
│   │   ├── inventory-transfer.hook.ts
│   │   ├── material-issue.hook.ts
│   │   ├── purchase-order.hook.ts
│   │   ├── purchase-return.hook.ts
│   │   ├── sales-payment.hook.ts
│   │   ├── sales-return.hook.ts
│   │   ├── stock-adjustment.hook.ts
│   │   └── work-order.hook.ts
│   ├── auth/                     # Auth configuration
│   │   └── auth.ts
│   ├── validators/               # Zod schemas
│   └── utils/                    # Helper functions
├── actions/                      # Server Actions (grouped by module)
│   ├── auth.actions.ts
│   ├── sales.actions.ts
│   ├── purchase.actions.ts
│   ├── inventory.actions.ts
│   ├── hrm.actions.ts
│   ├── finance.actions.ts
│   └── master.actions.ts
├── components/                   # Shared UI components
│   ├── ui/                       # Base components (HeroUI wrappers)
│   ├── forms/                    # Form components
│   ├── tables/                   # Table components
│   ├── layout/                   # Layout components (Sidebar, Header)
│   └── charts/                   # Chart components
├── types/                        # TypeScript types (auto-generated from Prisma + custom)
└── prisma/
    ├── schema.prisma             # Database schema
    ├── migrations/               # Prisma migrations
    └── seed.ts                   # Seeder
```

### 1.3 Dependencies

```json
{
  "dependencies": {
    "next": "^15",
    "@prisma/client": "^6",
    "next-auth": "^5",
    "@simplewebauthn/server": "^11",
    "@heroui/react": "^3",
    "@tanstack/react-query": "^5",
    "@tanstack/react-table": "^8",
    "tailwindcss": "^4",
    "framer-motion": "^12",
    "zod": "^3",
    "react-hook-form": "^7",
    "@hookform/resolvers": "^3",
    "zustand": "^5",
    "recharts": "^2",
    "date-fns": "^4",
    "bcryptjs": "^3",
    "sharp": "^0.33"
  },
  "devDependencies": {
    "prisma": "^6",
    "vitest": "^3",
    "@playwright/test": "^1",
    "@types/bcryptjs": "^2"
  }
}
```

---

## Fase 2: Database & Prisma Schema (Week 1-2)

### 2.1 Prisma Schema dari MySQL Existing

Gunakan `prisma db pull` untuk introspect schema existing, lalu refine manually.

### 2.2 Mapping Laravel Model → Prisma Model

| Laravel Pattern | Prisma Equivalent |
|----------------|-------------------|
| `$fillable` / `$guarded` | Prisma schema fields (semua explicit) |
| `$casts` | `@db.DateTime`, `@db.Decimal`, custom transformers |
| `belongsTo` | Relation field + `@relation` |
| `hasMany` | Opposite relation `Model[]` |
| `belongsToMany` | Implicit many-to-many atau explicit join table |
| `morphTo/morphMany` | Polymorphic: `reference_type` + `reference_id` string fields |
| `SoftDeletes` | `deleted_at DateTime?` + middleware filter |
| `$appends` (accessors) | Computed in service/component layer |
| Observers | Server Action hooks (called explicitly) |
| Scopes | Prisma `where` helper functions |

### 2.3 Key Schema Decisions

1. **Polymorphic relations** (`reference_type`, `reference_id`) tetap pakai string — Prisma tidak support native polymorphic, jadi handle di application layer
2. **Enum fields** — gunakan Prisma `enum` untuk status fields yang fixed
3. **JSON columns** — gunakan `Json` type di Prisma
4. **Decimal** — gunakan `Decimal` untuk semua monetary fields (precision 15, scale 2)

---

## Fase 3: Auth & RBAC (Week 2)

### 3.1 NextAuth.js v5 Setup

```typescript
// src/lib/auth/auth.ts
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({ /* email + password */ }),
    // WebAuthn provider for Passkey
  ],
  callbacks: {
    session({ session, token }) {
      // Attach roles & permissions to session
    }
  }
})
```

### 3.2 RBAC Middleware

```typescript
// src/lib/auth/rbac.ts
export function requirePermission(permission: string) {
  return async function(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { permissions: true } } }
    })
    return user?.roles.some(r => 
      r.permissions.some(p => p.name === permission)
    ) ?? false
  }
}
```

### 3.3 Mapping dari Spatie Permission

| Laravel (Spatie) | Next.js Equivalent |
|-----------------|-------------------|
| `$user->hasRole('admin')` | `session.user.roles.includes('admin')` |
| `$user->can('view_items')` | `await requirePermission('view_items')(userId)` |
| `@can('edit_items')` blade | Server Component permission check |
| Route middleware `role:admin` | Next.js middleware + `auth()` check |

---

## Fase 4: Core Services — Business Logic (Week 2-3)

### 4.1 Inventory Service (FIFO)

Port langsung dari `InventoryService.php`:

```typescript
// src/lib/services/inventory.service.ts
export class InventoryService {
  async postMove(moveId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const move = await tx.stockMove.findUniqueOrThrow({ where: { id: moveId } })
      
      if (move.status === 'posted') throw new Error('Already posted')
      
      if (move.impact === 'IN') {
        await this.handleIn(tx, move)
      } else {
        await this.handleOut(tx, move)
      }
      
      await tx.stockMove.update({ where: { id: moveId }, data: { status: 'posted' } })
    })
  }

  private async handleOut(tx: PrismaTransaction, move: StockMove): Promise<void> {
    // FIFO logic with row-level locking
    // 1. Check stock availability
    // 2. Consume layers oldest-first
    // 3. Update item qty_on_hand atomically
    // 4. Check low stock notification
  }
}
```

### 4.2 Journal Service (Double-Entry)

```typescript
// src/lib/services/journal.service.ts
export class JournalService {
  async record(params: JournalParams): Promise<JournalEntry> {
    const totalDebit = params.lines.reduce((sum, l) => sum + l.debit, 0)
    const totalCredit = params.lines.reduce((sum, l) => sum + l.credit, 0)
    
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Unbalanced: Debit ${totalDebit} vs Credit ${totalCredit}`)
    }
    
    return prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({ data: { ... } })
      await tx.journalEntryLine.createMany({ data: params.lines.map(...) })
      return entry
    })
  }
}
```

### 4.3 Document Sequence Service

```typescript
// src/lib/services/document-sequence.service.ts
export class DocumentSequenceService {
  static async next(key: string): Promise<number> {
    return prisma.$transaction(async (tx) => {
      // Upsert with atomic increment
      await tx.$executeRaw`
        INSERT INTO document_sequences (\`key\`, current_value, created_at, updated_at)
        VALUES (${key}, 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE current_value = current_value + 1, updated_at = NOW()
      `
      const row = await tx.documentSequence.findUnique({ where: { key } })
      return row!.currentValue
    })
  }
}
```

### 4.4 Observer → Hook Pattern

Laravel observers menjadi **explicit hook functions** yang dipanggil dari Server Actions:

```typescript
// src/lib/hooks/accounting.hook.ts
export async function onSalesInvoiceStatusChange(
  invoiceId: string, 
  newStatus: string, 
  oldStatus: string
): Promise<void> {
  if (newStatus === 'posted' && oldStatus !== 'posted') {
    const settings = await getSystemSettings()
    if (!settings.salesReceivableAccountId || !settings.salesRevenueAccountId) return
    
    await prisma.$transaction(async (tx) => {
      // Create journal: Dr. Receivable, Cr. Revenue + Tax
    })
  }
}
```

```typescript
// src/actions/sales.actions.ts
export async function postInvoice(invoiceId: string) {
  "use server"
  
  const oldInvoice = await prisma.salesInvoice.findUnique({ where: { id: invoiceId } })
  
  await prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: { status: 'posted' }
  })
  
  // Explicitly call hooks (replaces Laravel observer)
  await onSalesInvoiceStatusChange(invoiceId, 'posted', oldInvoice.status)
}
```

---

## Fase 5: Master Data Modules (Week 3-4)

### 5.1 Pattern untuk setiap Master Data page

Setiap modul master data mengikuti pattern:

```
src/app/(dashboard)/master/customers/
├── page.tsx              # Server Component - List with TanStack Table
├── [id]/
│   ├── page.tsx          # Detail view
│   └── edit/page.tsx     # Edit form
├── create/page.tsx       # Create form
└── _components/          # Module-specific client components
    ├── customer-table.tsx
    └── customer-form.tsx
```

### 5.2 Modul Master Data

1. Customers (+ Customer Vehicles)
2. Vendors
3. Items (+ Item Categories, Batches, Serials)
4. Warehouses (+ Racks, Rack Rows)
5. Employees (+ Departments, Positions)
6. Accounts (Chart of Accounts)
7. Products (+ BOM/Materials)
8. Brands, Unit of Measures
9. Vehicle Brands, Models, Variants
10. Holidays, Work Schedules
11. Taxes, Tax Groups
12. Currencies, Exchange Rates
13. Price Lists
14. Users, Roles, Permissions
15. Cost Centers, Profit Centers

---

## Fase 6: Transaction Modules (Week 4-7)

### 6.1 Sales Module

**Flow**: Quotation → Down Payment → Sales Order → Invoice → Payment

| Page | Server Actions | Hooks Triggered |
|------|---------------|-----------------|
| Quotations CRUD | `createQuotation`, `sendQuotation`, `acceptQuotation` | QuotationSync |
| Down Payments | `confirmDownPayment` | DownPaymentHook (create WO, Project, SO, Invoice) |
| Sales Orders | `createSalesOrder` | — |
| Invoices | `postInvoice` | AccountingHook (journal) |
| Payments | `createPayment` | SalesPaymentHook (update invoice status), AccountingHook |
| Returns | `completeSalesReturn` | SalesReturnHook (stock IN), AccountingHook |
| Projects | `updateProjectStage` | — |
| Delivery Orders | `confirmDelivery`, `deliverOrder` | — |

### 6.2 Purchase Module

**Flow**: Purchase Request → Purchase Order → Goods Receipt → Vendor Bill → Payment

| Page | Server Actions | Hooks Triggered |
|------|---------------|-----------------|
| Purchase Requests | `approvePR` | — |
| Purchase Orders | `approvePO`, `markOrdered`, `markReceived` | PurchaseOrderHook, AccountingHook |
| Goods Receipts | `verifyGoodsReceipt` | GoodsReceiptHook (stock IN) |
| Vendor Bills | `submitBill`, `approveBill` | — |
| Vendor Payments | `confirmVendorPayment` | — |
| Purchase Returns | `processPurchaseReturn` | PurchaseReturnHook (stock OUT), AccountingHook |

### 6.3 Inventory Module

| Page | Server Actions | Hooks Triggered |
|------|---------------|-----------------|
| Stock Moves | Read-only view | — |
| Stock Adjustments | `processAdjustment` | StockAdjustmentHook, AccountingHook |
| Inventory Transfers | `processTransfer`, `receiveTransfer` | InventoryTransferHook |
| Material Issues | `completeMaterialIssue` | MaterialIssueHook, AccountingHook |
| Work Orders | `completeWorkOrder` | WorkOrderHook, AccountingHook |

### 6.4 HRM Module

| Page | Server Actions | Hooks Triggered |
|------|---------------|-----------------|
| Attendance | `checkIn`, `checkOut` | NotificationHook (late) |
| Leave Requests | `approveLeave`, `rejectLeave` | NotificationHook |
| Overtime Requests | `approveOvertime` | — |
| Payroll | `processPayroll` | AccountingHook (journal) |
| Employee Loans | CRUD | — |
| Timesheets | CRUD | — |

### 6.5 Finance Module

| Page | Server Actions | Hooks Triggered |
|------|---------------|-----------------|
| Journals | `postJournal` | — |
| Expenses | `approveExpense` | AccountingHook |
| Petty Cash | `createPettyCash` | AccountingHook |
| Bank Reconciliation | `matchLine`, `completeReconciliation` | — |
| Budgets | CRUD | — |

---

## Fase 7: Reports & Advanced Features (Week 7-8)

### 7.1 Financial Reports
- Balance Sheet (Neraca)
- Cash Flow Statement (Arus Kas)
- Trial Balance (Neraca Saldo)
- Profit Center Income Statement (Laba Rugi per Profit Center)
- Aging Reports (Receivables, Payables, Inventory)

### 7.2 Implementation Pattern

```typescript
// src/app/(dashboard)/reports/balance-sheet/page.tsx
export default async function BalanceSheetPage({ searchParams }) {
  const { startDate, endDate } = searchParams
  
  // Server-side data fetching
  const data = await generateBalanceSheet(startDate, endDate)
  
  return <BalanceSheetView data={data} />
}
```

### 7.3 Advanced Features
- Approval Workflow Engine
- Activity Logging (audit trail)
- Global Search
- PDF Export (react-pdf)
- Excel Export

---

## Fase 8: Testing & Data Migration (Week 8-9)

### 8.1 Testing Strategy

| Type | Tool | Coverage Target |
|------|------|----------------|
| Unit Tests | Vitest | Services, Hooks, Validators |
| Integration Tests | Vitest + Prisma | Database operations, transactions |
| E2E Tests | Playwright | Critical flows (Sales, Purchase, Inventory) |

### 8.2 Critical Test Cases

1. **FIFO Costing**: Multiple IN layers → OUT consumes oldest first
2. **Double-Entry Balance**: Every journal entry debit = credit
3. **Document Sequence**: Concurrent requests get unique sequential numbers
4. **DP Confirmation**: Creates exactly 1 WO + 1 Project + 1 SO + 1 Invoice (idempotent)
5. **Stock Availability**: Cannot go negative, proper error on insufficient stock
6. **Payment Status**: Invoice status correctly transitions (posted → partial → paid)

### 8.3 Data Migration Strategy

```bash
# 1. Export existing MySQL data
mysqldump -u root yara_erp > backup.sql

# 2. Run Prisma migrations on fresh DB
npx prisma migrate deploy

# 3. Import data (schema-compatible)
mysql -u root yara_erp_next < backup.sql

# 4. Run data transformation script (if needed)
npx ts-node prisma/migrate-data.ts
```

---

## Timeline Summary

| Fase | Durasi | Deliverable |
|------|--------|-------------|
| 1. Foundation | 1 minggu | Project setup, folder structure, dependencies |
| 2. Database | 1-2 minggu | Prisma schema, migrations, seed |
| 3. Auth | 1 minggu | Login, RBAC, Passkey |
| 4. Core Services | 1-2 minggu | Inventory, Journal, DocSequence, Notifications |
| 5. Master Data | 1-2 minggu | 15+ CRUD modules |
| 6. Transactions | 3-4 minggu | Sales, Purchase, Inventory, HRM, Finance |
| 7. Reports | 1-2 minggu | Financial reports, advanced features |
| 8. Testing | 1-2 minggu | Tests, data migration, deployment |

**Total Estimasi: 10-14 minggu**

---

## Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| Prisma tidak support row-level locking sebaik Eloquent | Data inconsistency | Gunakan `$executeRaw` untuk critical sections |
| Polymorphic relations tidak native di Prisma | Complex queries | Application-level resolution + helper functions |
| Observer pattern hilang (no auto-trigger) | Missed side effects | Strict hook calling convention + integration tests |
| Performance degradation pada large datasets | Slow pages | Server Components + pagination + DB indexes |
| Breaking changes saat migrasi data | Data loss | Comprehensive backup + rollback plan |
