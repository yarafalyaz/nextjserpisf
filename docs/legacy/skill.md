# Skill: YaraERP Next.js Migration Technical Reference

## 1. Arsitektur Mapping: Laravel → Next.js

| Laravel Concept           | Next.js Equivalent                                    |
| ------------------------- | ----------------------------------------------------- |
| Controller + Route        | Server Action / Route Handler                         |
| Eloquent Model            | Prisma Model + Service Layer                          |
| Observer                  | Explicit Hook Function (dipanggil dari Server Action) |
| Service Class             | TypeScript Service Class (server-only)                |
| Middleware                | Next.js Middleware + Auth Check                       |
| Blade/Filament View       | React Server Component + Client Component             |
| API Resource              | Prisma select/include + transform                     |
| Form Request (validation) | Zod Schema                                            |
| Event/Listener            | Explicit function call dalam transaction              |
| Queue/Job                 | Vercel Cron / BullMQ / inngest                        |
| Storage (filesystem)      | S3 / Local via `@vercel/blob` atau `multer`           |
| Cache                     | `unstable_cache` / Redis                              |
| Session                   | NextAuth session (JWT/Database)                       |

---

## 2. Database: Prisma Schema Pattern

### 2.1 Koneksi MySQL

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

### 2.2 Contoh Model dengan Relasi

```prisma
model SalesInvoice {
  id              Int       @id @default(autoincrement())
  documentNo      String    @unique @map("document_no")
  customerId      Int       @map("customer_id")
  salesOrderId    Int?      @map("sales_order_id")
  quotationId     Int?      @map("quotation_id")
  date            DateTime
  dueDate         DateTime? @map("due_date")
  subtotal        Decimal   @db.Decimal(15, 2)
  discount        Decimal   @default(0) @db.Decimal(15, 2)
  tax             Decimal   @default(0) @db.Decimal(15, 2)
  grandTotal      Decimal   @map("grand_total") @db.Decimal(15, 2)
  paidAmount      Decimal   @default(0) @map("paid_amount") @db.Decimal(15, 2)
  totalAmount     Decimal   @default(0) @map("total_amount") @db.Decimal(15, 2)
  taxAmount       Decimal   @default(0) @map("tax_amount") @db.Decimal(15, 2)
  status          SalesInvoiceStatus @default(draft)
  paymentStatus   String?   @map("payment_status")
  notes           String?   @db.Text
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  customer        Customer  @relation(fields: [customerId], references: [id])
  salesOrder      SalesOrder? @relation(fields: [salesOrderId], references: [id])
  quotation       Quotation? @relation(fields: [quotationId], references: [id])
  items           SalesInvoiceItem[]
  payments        SalesPayment[]

  @@map("sales_invoices")
}

enum SalesInvoiceStatus {
  draft
  sent
  posted
  partial
  paid
  cancelled
}
```

### 2.3 Polymorphic Pattern (untuk Journal, StockMove, Approval)

```prisma
model Journal {
  id              Int      @id @default(autoincrement())
  journalNumber   String   @unique @map("journal_number")
  transactionDate DateTime @map("transaction_date")
  referenceType   String?  @map("reference_type") // "SalesInvoice", "PurchaseOrder", etc.
  referenceId     Int?     @map("reference_id")
  description     String?
  type            String   // GENERAL, ADJUSTMENT, PRODUCTION
  status          String   @default("DRAFT")
  totalDebit      Decimal  @map("total_debit") @db.Decimal(15, 2)
  totalCredit     Decimal  @map("total_credit") @db.Decimal(15, 2)
  createdBy       Int?     @map("created_by")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  entries         JournalEntry[]
  creator         User?    @relation(fields: [createdBy], references: [id])

  @@map("journals")
}
```

---

## 3. Service Layer Implementation

### 3.1 Inventory Service (FIFO) — CRITICAL

```typescript
// src/lib/services/inventory.service.ts
import { PrismaClient, Prisma, StockMove } from "@prisma/client";
import { notificationService } from "./notification.service";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export class InventoryService {
  constructor(private prisma: PrismaClient) {}

  async postMove(moveId: number): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const move = await tx.stockMove.findUniqueOrThrow({
          where: { id: moveId },
        });

        if (move.status === "posted") {
          throw new Error(`Stock move ${move.documentNo} is already posted.`);
        }

        if (move.impact === "IN") {
          await this.handleIn(tx, move);
        } else if (move.impact === "OUT") {
          await this.handleOut(tx, move);
        }

        await tx.stockMove.update({
          where: { id: moveId },
          data: { status: "posted" },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async handleIn(tx: TxClient, move: StockMove): Promise<void> {
    // Create inventory layer
    await tx.inventoryLayer.create({
      data: {
        itemId: move.itemId,
        stockMoveId: move.id,
        qtyIn: move.qty,
        qtyOut: 0,
        remaining: move.qty,
        unitCost: move.cost,
      },
    });

    // Atomic increment
    await tx.$executeRaw`
      UPDATE items SET qty_on_hand = qty_on_hand + ${move.qty}
      WHERE id = ${move.itemId}
    `;
  }

  private async handleOut(tx: TxClient, move: StockMove): Promise<void> {
    // Check stock with lock
    const [item] = await tx.$queryRaw<any[]>`
      SELECT * FROM items WHERE id = ${move.itemId} FOR UPDATE
    `;

    if (!item) throw new Error(`Item not found: ${move.itemId}`);
    if (item.qty_on_hand < move.qty) {
      throw new Error(
        `Stok tidak mencukupi untuk item ${item.sku}. Tersedia: ${item.qty_on_hand}, Dibutuhkan: ${move.qty}`,
      );
    }

    // FIFO consumption
    const layers = await tx.$queryRaw<any[]>`
      SELECT * FROM inventory_layers
      WHERE item_id = ${move.itemId} AND remaining > 0
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `;

    let qtyToConsume = Number(move.qty);
    let totalCost = 0;

    for (const layer of layers) {
      if (qtyToConsume <= 0) break;

      const consume = Math.min(Number(layer.remaining), qtyToConsume);

      await tx.inventoryLayer.update({
        where: { id: layer.id },
        data: {
          qtyOut: { increment: consume },
          remaining: { decrement: consume },
        },
      });

      totalCost += consume * Number(layer.unit_cost);
      qtyToConsume -= consume;
    }

    if (qtyToConsume > 0) {
      throw new Error("Inkonsistensi data: layer FIFO tidak mencukupi.");
    }

    // Update cost on move
    const unitCost = totalCost / Number(move.qty);
    await tx.stockMove.update({
      where: { id: move.id },
      data: { cost: unitCost },
    });

    // Atomic decrement with guard
    const result = await tx.$executeRaw`
      UPDATE items SET qty_on_hand = qty_on_hand - ${move.qty}
      WHERE id = ${move.itemId} AND qty_on_hand >= ${move.qty}
    `;

    if (result === 0) {
      throw new Error("Concurrent stock modification detected. Please retry.");
    }

    // Check low stock
    const updatedItem = await tx.item.findUnique({
      where: { id: move.itemId },
    });
    if (
      updatedItem &&
      updatedItem.minStock > 0 &&
      updatedItem.qtyOnHand <= updatedItem.minStock
    ) {
      // Queue notification (outside transaction)
      setTimeout(
        () => notificationService.checkAndNotifyLowStock(updatedItem),
        0,
      );
    }
  }

  async reverseMove(moveId: number): Promise<void> {
    // Creates opposite move and posts it
  }
}
```

### 3.2 Document Sequence Service

```typescript
// src/lib/services/document-sequence.service.ts
import { prisma } from "@/lib/db/prisma";

export class DocumentSequenceService {
  static async next(key: string): Promise<number> {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO document_sequences (\`key\`, current_value, created_at, updated_at)
        VALUES (${key}, 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE current_value = current_value + 1, updated_at = NOW()
      `;

      const row = await tx.$queryRaw<any[]>`
        SELECT current_value FROM document_sequences
        WHERE \`key\` = ${key} FOR UPDATE
      `;

      return Number(row[0].current_value);
    });
  }

  static async peek(key: string): Promise<number> {
    const row = await prisma.documentSequence.findUnique({ where: { key } });
    return row ? Number(row.currentValue) : 0;
  }
}
```

### 3.3 Accounting Hook (Observer Replacement)

```typescript
// src/lib/hooks/accounting.hook.ts
import { prisma } from "@/lib/db/prisma";
import { getSystemSettings } from "@/lib/utils/settings";

export async function onSalesInvoicePosted(invoiceId: number, userId?: number) {
  const settings = await getSystemSettings();
  if (!settings.salesReceivableAccountId || !settings.salesRevenueAccountId)
    return;

  const invoice = await prisma.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });

  await prisma.$transaction(async (tx) => {
    const journalNumber = `INV/${invoice.id}/${new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .slice(0, 14)}`;

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: invoice.date,
        referenceType: "SalesInvoice",
        referenceId: invoice.id,
        description: `Invoice Posting ${invoice.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: invoice.totalAmount,
        totalCredit: invoice.totalAmount,
        createdBy: userId,
      },
    });

    const taxAmount = Number(invoice.taxAmount ?? 0);
    const subtotal = Number(invoice.totalAmount) - taxAmount;

    // Dr. Receivable
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.salesReceivableAccountId!,
        debit: invoice.totalAmount,
        credit: 0,
        memo: "Piutang Usaha",
      },
    });

    // Cr. Revenue
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.salesRevenueAccountId!,
        debit: 0,
        credit: subtotal,
        memo: "Pendapatan Penjualan",
      },
    });

    // Cr. Tax (if any)
    if (taxAmount > 0 && settings.salesTaxAccountId) {
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.salesTaxAccountId,
          debit: 0,
          credit: taxAmount,
          memo: "PPN Keluaran",
        },
      });
    }
  });
}

export async function onSalesPaymentCreated(
  paymentId: number,
  userId?: number,
) {
  // Dr. Cash/Bank, Cr. Receivable
}

export async function onPurchaseOrderReceived(
  orderId: number,
  userId?: number,
) {
  // Dr. Inventory + Tax, Cr. Payable
}

export async function onStockAdjustmentProcessed(
  adjustmentId: number,
  userId?: number,
) {
  // Dr/Cr Inventory vs Adjustment based on positive/negative
}

export async function onWorkOrderCompleted(
  workOrderId: number,
  userId?: number,
) {
  // Dr. WIP, Cr. Inventory
}

export async function onExpenseApproved(expenseId: number, userId?: number) {
  // Dr. Expense Account, Cr. Paid From Account (idempotent)
}

export async function onPettyCashCreated(pettyCashId: number, userId?: number) {
  // IN: Dr. PettyCash, Cr. Source | OUT: Dr. Expense, Cr. PettyCash
}

export async function onSalesReturnCompleted(
  returnId: number,
  userId?: number,
) {
  // Dr. Sales Return, Cr. Receivable
}

export async function onPurchaseReturnProcessed(
  returnId: number,
  userId?: number,
) {
  // Dr. Payable, Cr. Inventory
}

export async function onMaterialIssueCompleted(
  issueId: number,
  userId?: number,
) {
  // Dr. Material Issue Expense, Cr. Inventory
}
```

---

## 4. Server Actions Pattern

### 4.1 Sales Invoice Post Action

```typescript
// src/actions/sales.actions.ts
"use server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { onSalesInvoicePosted } from "@/lib/hooks/accounting.hook";
import { revalidatePath } from "next/cache";

export async function postInvoice(invoiceId: number) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const invoice = await prisma.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });

  if (invoice.status !== "sent" && invoice.status !== "draft") {
    throw new Error("Invoice hanya bisa di-post dari status draft/sent");
  }

  await prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: { status: "posted" },
  });

  // Trigger accounting hook (replaces Laravel Observer)
  await onSalesInvoicePosted(invoiceId, Number(session.user.id));

  revalidatePath("/sales/invoices");
  return { success: true };
}
```

### 4.2 Down Payment Confirm Action (Complex)

```typescript
// src/actions/sales.actions.ts
export async function confirmDownPayment(dpId: number) {
  "use server";

  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.$transaction(async (tx) => {
    const dp = await tx.downPayment.findUniqueOrThrow({
      where: { id: dpId },
      include: {
        quotation: {
          include: {
            sections: { include: { items: { include: { item: true } } } },
            customer: true,
            customerVehicle: { include: { vehicle: true } },
          },
        },
      },
    });

    if (dp.status === "confirmed") throw new Error("Already confirmed");
    if (dp.quotation?.status !== "accepted")
      throw new Error("Quotation not accepted");

    // Idempotency check
    const existing = await tx.workOrder.findFirst({
      where: { quotationId: dp.quotation.id },
    });
    if (existing) throw new Error("Documents already exist");

    // 1. Create Work Order
    // 2. Create Project + initializeStages
    // 3. Create Sales Order + Items
    // 4. Create Sales Invoice + Items
    // 5. Update DP status
    // 6. Update Quotation status → converted

    await tx.downPayment.update({
      where: { id: dpId },
      data: { status: "confirmed" },
    });
  });

  revalidatePath("/sales/down-payments");
  revalidatePath("/sales/invoices");
  revalidatePath("/sales/orders");
}
```

---

## 5. Auth & RBAC

### 5.1 NextAuth Configuration

```typescript
// src/lib/auth/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string, isActive: true },
          include: {
            roles: { include: { permissions: true } },
          },
        });

        if (!user) return null;
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );
        if (!valid) return null;

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          roles: user.roles.map((r) => r.name),
          permissions: user.roles.flatMap((r) =>
            r.permissions.map((p) => p.name),
          ),
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.roles = user.roles;
        token.permissions = user.permissions;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.roles = token.roles as string[];
      session.user.permissions = token.permissions as string[];
      return session;
    },
  },
});
```

### 5.2 Permission Helper

```typescript
// src/lib/auth/permissions.ts
import { auth } from "./auth";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}

export async function requirePermission(permission: string) {
  const user = await requireAuth();
  if (user.roles.includes("super_admin")) return user;
  if (!user.permissions.includes(permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
  return user;
}

export async function requireRole(role: string) {
  const user = await requireAuth();
  if (!user.roles.includes(role) && !user.roles.includes("super_admin")) {
    throw new Error(`Forbidden: missing role ${role}`);
  }
  return user;
}
```

---

## 6. System Settings Singleton

```typescript
// src/lib/utils/settings.ts
import { prisma } from "@/lib/db/prisma";
import { cache } from "react";

export const getSystemSettings = cache(async () => {
  let settings = await prisma.systemSetting.findFirst();

  if (!settings) {
    settings = await prisma.systemSetting.create({
      data: {
        companyName: "Yara ERP",
        companyEmail: "admin@yaraerp.app",
        costingMethod: "FIFO",
        fiscalYearStartMonth: 1,
        currencyCode: "IDR",
        currencySymbol: "Rp ",
        // ... default values
      },
    });
  }

  return settings;
});
```

---

## 7. Document Number Generation

```typescript
// src/lib/utils/document-number.ts
import { DocumentSequenceService } from "@/lib/services/document-sequence.service";
import { getSystemSettings } from "./settings";

export async function generateDocumentNumber(
  prefix: string,
  format: "complex" | "simple" = "complex",
): Promise<string> {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();

  if (format === "complex") {
    const key = `${prefix}-${year}-${month}`;
    const seq = await DocumentSequenceService.next(key);
    const settings = await getSystemSettings();
    const companyCode =
      settings.companyName?.substring(0, 3).toUpperCase() ?? "YRA";
    return `${String(seq).padStart(3, "0")}/${prefix}/${companyCode}/${month}/${year}`;
  } else {
    const key = `${prefix}-GLOBAL`;
    const seq = await DocumentSequenceService.next(key);
    return `${prefix}-${String(seq).padStart(4, "0")}`;
  }
}
```

---

## 8. Notification Service

```typescript
// src/lib/services/notification.service.ts
import { prisma } from "@/lib/db/prisma";

export const notificationService = {
  async notifyAdmins(title: string, body: string, type: string = "info") {
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { name: { in: ["super_admin", "admin"] } } },
      },
    });

    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        title,
        body,
        type,
        readAt: null,
      })),
    });
  },

  async notifyUser(
    userId: number,
    title: string,
    body: string,
    type: string = "info",
  ) {
    await prisma.notification.create({
      data: { userId, title, body, type },
    });
  },

  async checkAndNotifyLowStock(item: {
    id: number;
    name: string;
    qtyOnHand: number;
    minStock: number;
  }) {
    if (item.minStock > 0 && item.qtyOnHand <= item.minStock) {
      await this.notifyAdmins(
        `⚠️ Stok ${item.name} Menipis`,
        `Stok saat ini: ${item.qtyOnHand} (Minimum: ${item.minStock}). Segera lakukan pembelian.`,
        "warning",
      );
    }
  },
};
```

---

## 9. Page Pattern (Server Component + Client Component)

### 9.1 List Page (Server Component)

```typescript
// src/app/(dashboard)/sales/invoices/page.tsx
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { InvoiceTable } from "./_components/invoice-table"

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>
}) {
  await requirePermission("view_sales_invoices")

  const params = await searchParams
  const page = Number(params.page) || 1
  const perPage = 20

  const where = {
    ...(params.search && {
      OR: [
        { documentNo: { contains: params.search } },
        { customer: { name: { contains: params.search } } },
      ],
    }),
    ...(params.status && { status: params.status as any }),
  }

  const [invoices, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      include: { customer: true, payments: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.salesInvoice.count({ where }),
  ])

  return (
    <div>
      <h1>Sales Invoices</h1>
      <InvoiceTable data={invoices} total={total} page={page} perPage={perPage} />
    </div>
  )
}
```

### 9.2 Client Component (Table)

```typescript
// src/app/(dashboard)/sales/invoices/_components/invoice-table.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Table, Pagination, Input, Chip } from "@heroui/react";
import { postInvoice } from "@/actions/sales.actions";

export function InvoiceTable({ data, total, page, perPage }) {
  const router = useRouter();
  // TanStack Table or HeroUI Table implementation
}
```

---

## 10. Key Differences & Gotchas

| Aspek                 | Laravel                     | Next.js                                      |
| --------------------- | --------------------------- | -------------------------------------------- |
| Observer auto-trigger | Implicit (model events)     | Explicit (call hook in action)               |
| DB Transaction        | `DB::transaction(fn)`       | `prisma.$transaction(async tx => {})`        |
| Row locking           | `->lockForUpdate()`         | `$queryRaw ... FOR UPDATE`                   |
| Atomic increment      | `DB::raw('col + 1')`        | `$executeRaw` or `{ increment: 1 }`          |
| Polymorphic           | Native morphTo/morphMany    | Manual (referenceType + referenceId strings) |
| Soft Delete           | `SoftDeletes` trait         | Prisma middleware + `deletedAt` field        |
| Eager Loading         | `->with(['relation'])`      | `include: { relation: true }`                |
| Scopes                | Model scope methods         | Helper functions returning `where` objects   |
| Validation            | FormRequest class           | Zod schema + `safeParse()`                   |
| File Upload           | `$request->file()->store()` | `formData.get('file')` + write to disk/S3    |
| Pagination            | `->paginate(20)`            | Manual skip/take + count                     |
| Auth check            | `auth()->id()`              | `const session = await auth()`               |
| Settings              | `SystemSetting::current()`  | `await getSystemSettings()` (cached)         |

---

## 11. Migration Checklist

- [ ] Prisma schema dari MySQL introspection (`prisma db pull`)
- [ ] NextAuth setup (Credentials + Passkey)
- [ ] RBAC middleware (roles + permissions)
- [ ] InventoryService (FIFO with locking)
- [ ] JournalService (double-entry validation)
- [ ] DocumentSequenceService (atomic numbering)
- [ ] NotificationService
- [ ] QuotationSyncService
- [ ] All 13 observer hooks ported
- [ ] Master Data CRUD (15+ modules)
- [ ] Sales flow (Quotation → DP → SO → Invoice → Payment)
- [ ] Purchase flow (PR → PO → GR → Bill → Payment)
- [ ] Inventory operations (Transfer, Adjustment, Material Issue)
- [ ] HRM (Attendance, Leave, Overtime, Payroll)
- [ ] Finance (Journal, Expense, Petty Cash, Bank Recon)
- [ ] CRM (Leads, Tickets)
- [ ] Asset Management (Depreciation, Disposal)
- [ ] Reports (Balance Sheet, Cash Flow, Trial Balance, Aging)
- [ ] Approval Workflow Engine
- [ ] Activity Logging
- [ ] Data migration script
- [ ] E2E tests for critical flows
