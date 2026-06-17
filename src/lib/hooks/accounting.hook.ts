import { Prisma } from "@prisma/client";
import { prisma, TxClient } from "@/lib/db/prisma";
import { consumeFifoLayers } from "@/lib/services/inventory-fifo";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { generateDocumentNumberBatch } from "@/lib/utils/document-number";

/**
 * Accounting Hook - Observer pattern replacement for all accounting journal entries.
 * Setiap fungsi membuat journal entry double-entry yang balanced.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get system settings (account IDs)
// ─────────────────────────────────────────────────────────────────────────────

async function getSystemSettings(tx?: TxClient) {
  const db = tx || prisma;
  const settings = await db.systemSetting.findFirst();
  if (!settings) throw new Error("System settings belum dikonfigurasi.");
  return settings;
}

const executeInTx = async (
  txClient: TxClient | undefined,
  callback: (tx: TxClient) => Promise<unknown>,
) => {
  return txClient ? callback(txClient) : prisma.$transaction(callback);
};

async function generateJournalNumber(
  _tx: TxClient,
  prefix: string,
  referenceId: number,
): Promise<string> {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  return `${prefix}/${referenceId}/${timestamp}`;
}

/**
 * Delete the journal(s) and their entries linked to a source document.
 * Use when a DRAFT document (vendor bill/payment, down payment, etc.) whose
 * journal was already posted gets deleted/edited, to avoid orphaned GL entries.
 */
export async function deleteJournalByReference(
  referenceType: string,
  referenceId: number,
  txClient?: TxClient,
): Promise<void> {
  await executeInTx(txClient, async (tx) => {
    await deleteJournalByReferenceTx(tx, referenceType, referenceId);
  });
}

/**
 * Same as deleteJournalByReference but runs inside an existing transaction.
 * Use this from delete/cancel actions that already manage their own $transaction
 * to avoid nested transactions. `referenceType` accepts one or many types so a
 * single document (e.g. a posted sales invoice with separate revenue + COGS
 * journals) can have all of its GL entries reversed atomically.
 */
export async function deleteJournalByReferenceTx(
  tx: TxClient,
  referenceType: string | string[],
  referenceId: number | number[],
): Promise<void> {
  const journals = await tx.journal.findMany({
    where: {
      referenceType: Array.isArray(referenceType)
        ? { in: referenceType }
        : referenceType,
      referenceId: Array.isArray(referenceId)
        ? { in: referenceId }
        : referenceId,
    },
    select: { id: true },
  });
  if (journals.length === 0) return;
  const journalIds = journals.map((j) => j.id);
  await tx.journalEntry.deleteMany({
    where: { journalId: { in: journalIds } },
  });
  await tx.journal.deleteMany({ where: { id: { in: journalIds } } });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. onSalesInvoicePosted
//    Dr. Receivable (total_amount)
//    Cr. Revenue (subtotal) + Cr. Tax (tax_amount)
//    Dr. COGS, Cr. Inventory (cost of invoice items)
// ─────────────────────────────────────────────────────────────────────────────

export async function onSalesInvoicePosted(
  invoiceId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  if (!settings.salesReceivableAccountId || !settings.salesRevenueAccountId)
    return;

  const invoice = await db.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true },
  });

  // Idempotency: check if journal already exists
  const existing = await db.journal.findFirst({
    where: { referenceType: "SalesInvoice", referenceId: invoiceId },
  });
  if (existing) return;

  await assertPeriodOpen(invoice.date, txClient);

  await executeInTx(txClient, async (tx) => {
    // Fix: Re-fetch the invoice inside the transaction under a lock to prevent
    // stale data from being used in the journal.
    const inv = await tx.salesInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        totalAmount: true,
        taxAmount: true,
        date: true,
        documentNo: true,
      },
    });
    if (!inv) throw new Error("Invoice tidak ditemukan");

    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "SalesInvoice", referenceId: invoiceId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "INV", invoiceId);

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: inv.date,
        referenceType: "SalesInvoice",
        referenceId: inv.id,
        description: `Invoice Posting ${inv.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: inv.totalAmount,
        totalCredit: inv.totalAmount,
        createdBy: userId ?? null,
      },
    });

    const taxAmount = Number(inv.taxAmount ?? 0);
    const hasTaxAccount = taxAmount > 0 && !!settings.salesTaxAccountId;
    // Keep the journal balanced: only split out tax when a tax account exists,
    // otherwise revenue absorbs the full amount (credit total == debit total).
    const revenueCredit = hasTaxAccount
      ? Number(inv.totalAmount) - taxAmount
      : Number(inv.totalAmount);

    // Build the balanced journal lines and insert them in one batch instead of
    // 2-3 sequential journalEntry.create round-trips:
    //   Dr. Piutang Usaha (full invoice total)
    //   Cr. Pendapatan Penjualan (revenue net of tax)
    //   Cr. PPN Keluaran (only when a tax account is configured)
    const invoiceEntries: Prisma.JournalEntryCreateManyInput[] = [
      {
        journalId: journal.id,
        accountId: settings.salesReceivableAccountId!,
        debit: inv.totalAmount,
        credit: 0,
        memo: "Piutang Usaha",
      },
      {
        journalId: journal.id,
        accountId: settings.salesRevenueAccountId!,
        debit: 0,
        credit: revenueCredit,
        memo: "Pendapatan Penjualan",
      },
    ];
    if (hasTaxAccount) {
      invoiceEntries.push({
        journalId: journal.id,
        accountId: settings.salesTaxAccountId!,
        debit: 0,
        credit: taxAmount,
        memo: "PPN Keluaran",
      });
    }
    await tx.journalEntry.createMany({ data: invoiceEntries });

    // Dr. HPP / Cr. Persediaan + physical stock-out for PRODUCT items.
    // Previously the COGS journal was posted but stock (qtyOnHand + FIFO layers)
    // was never reduced, diverging the GL inventory from the stock subledger.
    // Here we also create StockMove OUT and consume FIFO for stockable products.
    const productItems = invoice.items.filter(
      (it): it is typeof it & { itemId: number } =>
        typeof it.itemId === "number" && Number(it.qty) > 0,
    );
    const itemIds = productItems.map((it) => it.itemId);
    const itemRows = itemIds.length
      ? await tx.item.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            cost: true,
            isProduct: true,
            defaultWarehouseId: true,
            unitOfMeasure: true,
          },
        })
      : [];
    const itemInfo = new Map(itemRows.map((r) => [r.id, r]));

    const enteredUoms = [
      ...new Set(
        productItems
          .map((it) => (it as { uom?: string | null }).uom)
          .filter(Boolean),
      ),
    ] as string[];
    const conversions =
      itemIds.length && enteredUoms.length
        ? await tx.uomConversion.findMany({
            where: { itemId: { in: itemIds }, code: { in: enteredUoms } },
            select: { itemId: true, code: true, factorToBase: true },
          })
        : [];
    const factorMap = new Map(
      conversions.map((c) => [`${c.itemId}:${c.code}`, Number(c.factorToBase)]),
    );

    if (itemIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(itemIds)}) FOR UPDATE`;
    }

    // Batch SM generation
    const smProductIdx: number[] = [];
    for (let i = 0; i < productItems.length; i++) {
      const it = productItems[i];
      const info = itemInfo.get(it.itemId);
      if (info?.isProduct) smProductIdx.push(i);
    }
    const smDocNos = smProductIdx.length
      ? await generateDocumentNumberBatch("SM", smProductIdx.length)
      : [];

    let cogsAmount = 0;
    let smCursor = 0;
    for (const line of productItems) {
      const info = itemInfo.get(line.itemId);
      if (!info || !info.isProduct) continue; // services / non-stock items: no stock-out, no COGS
      const smDocNo = smDocNos[smCursor++];
      // Multi-UoM: convert sold qty to base units for stock-out / COGS.
      const uom = (line as { uom?: string | null }).uom;
      const isBaseUom = !uom || uom === info.unitOfMeasure;
      const rawFactor = isBaseUom
        ? 1
        : (factorMap.get(`${line.itemId}:${uom}`) ?? 1);
      const factor = rawFactor > 0 ? rawFactor : 1;
      const qty = Number(line.qty) * factor;
      const fallbackUnitCost =
        factor > 0 ? Number(info.cost ?? 0) / factor : Number(info.cost ?? 0);

      // Decrement on-hand (reflects the sale even if overselling) and consume
      // FIFO layers from the item's default warehouse up to what is available
      // (allowShortfall — a sale is never blocked by stock).
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${qty} WHERE id = ${line.itemId}`;
      const lineSerials = Array.isArray(
        (line as { serialNumbers?: unknown }).serialNumbers,
      )
        ? (
            (line as { serialNumbers?: unknown[] }).serialNumbers as unknown[]
          ).map((s) => String(s))
        : null;
      const { consumedCost, shortfall } = await consumeFifoLayers(tx, {
        itemId: line.itemId,
        warehouseId: info.defaultWarehouseId,
        qty,
        allowShortfall: true,
        serialNumbers: lineSerials,
      });
      const lineCogs = consumedCost + shortfall * fallbackUnitCost;
      cogsAmount += lineCogs;
      const moveUnitCost = qty > 0 ? lineCogs / qty : fallbackUnitCost;

      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: line.itemId,
          warehouseId: info.defaultWarehouseId ?? null,
          qty,
          cost: moveUnitCost,
          impact: "OUT",
          status: "posted",
          referenceType: "SalesInvoice",
          referenceId: invoice.id,
          notes: `Penjualan ${invoice.documentNo}`,
          createdBy: userId ?? null,
        },
      });
    }

    if (
      cogsAmount > 0 &&
      settings.cogsAccountId &&
      settings.inventoryAccountId
    ) {
      const cogsJournalNumber = await generateJournalNumber(
        tx,
        "INV-COGS",
        invoiceId,
      );
      const cogsJournal = await tx.journal.create({
        data: {
          journalNumber: cogsJournalNumber,
          transactionDate: invoice.date,
          referenceType: "SalesInvoiceCOGS",
          referenceId: invoice.id,
          description: `COGS Invoice ${invoice.documentNo}`,
          type: "GENERAL",
          status: "POSTED",
          totalDebit: cogsAmount,
          totalCredit: cogsAmount,
          createdBy: userId ?? null,
        },
      });

      // Batch create the two journal entries for the COGS journal (eliminates N+1)
      await tx.journalEntry.createMany({
        data: [
          {
            journalId: cogsJournal.id,
            accountId: settings.cogsAccountId,
            debit: cogsAmount,
            credit: 0,
            memo: "Harga Pokok Penjualan",
          },
          {
            journalId: cogsJournal.id,
            accountId: settings.inventoryAccountId,
            debit: 0,
            credit: cogsAmount,
            memo: "Pengeluaran Persediaan atas Penjualan",
          },
        ],
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. onSalesPaymentCreated
//    Dr. Cash/Bank (amount)
//    Cr. Receivable (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onSalesPaymentCreated(
  paymentId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  if (!settings.salesReceivableAccountId) return;

  const payment = await db.salesPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { salesInvoice: true },
  });

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "SalesPayment", referenceId: paymentId },
  });
  if (existing) return;

  await assertPeriodOpen(payment.paymentDate ?? new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "SalesPayment", referenceId: paymentId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "PAY", paymentId);

    // Determine cash/bank account from payment method or default
    const cashAccountId = payment.accountId ?? settings.cashBankAccountId;

    if (!cashAccountId) return;

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: payment.paymentDate ?? new Date(),
        referenceType: "SalesPayment",
        referenceId: payment.id,
        description: `Pembayaran Invoice ${payment.salesInvoice?.documentNo ?? ""}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: payment.amount,
        totalCredit: payment.amount,
        createdBy: userId ?? null,
      },
    });

    // Dr. Kas/Bank + Cr. Piutang Usaha
    await tx.journalEntry.createMany({
      data: [
        {
          journalId: journal.id,
          accountId: cashAccountId,
          debit: payment.amount,
          credit: 0,
          memo: "Penerimaan Kas/Bank",
        },
        {
          journalId: journal.id,
          accountId: settings.salesReceivableAccountId!,
          debit: 0,
          credit: payment.amount,
          memo: "Pelunasan Piutang",
        },
      ],
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. onPurchaseOrderReceived
//    Dr. Inventory (subtotal) + Dr. Tax (tax_amount)
//    Cr. Payable (total_amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onPurchaseOrderReceived(
  orderId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  if (!settings.inventoryAccountId || !settings.purchasePayableAccountId)
    return;

  const order = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: orderId },
  });

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "PurchaseOrder", referenceId: orderId },
  });
  if (existing) return;

  await assertPeriodOpen(new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx: two concurrent calls both pass the early
    // `findFirst` (returns null) and both open their own $transaction;
    // without this in-tx re-check the second call's `tx.journal.create` trips
    // the @@unique([referenceType, referenceId]) constraint and surfaces as
    // a confusing Prisma P2002 error to the user even though the operation
    // logically succeeded once.
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "PurchaseOrder", referenceId: orderId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "PO-RCV", orderId);

    const taxAmount = Number(order.tax ?? 0);
    const hasTaxAccount = taxAmount > 0 && !!settings.purchaseTaxAccountId;
    // Keep balanced: inventory absorbs tax when no input-tax account is set.
    const inventoryDebit = hasTaxAccount
      ? Number(order.totalAmount) - taxAmount
      : Number(order.totalAmount);

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: new Date(),
        referenceType: "PurchaseOrder",
        referenceId: order.id,
        description: `Penerimaan PO ${order.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: order.totalAmount,
        totalCredit: order.totalAmount,
        createdBy: userId ?? null,
      },
    });

    // Dr. Persediaan + Dr. PPN Masukan (only when configured) + Cr. Hutang Usaha
    const purchaseOrderEntries: Prisma.JournalEntryCreateManyInput[] = [
      {
        journalId: journal.id,
        accountId: settings.inventoryAccountId!,
        debit: inventoryDebit,
        credit: 0,
        memo: "Persediaan Masuk",
      },
    ];
    if (hasTaxAccount) {
      purchaseOrderEntries.push({
        journalId: journal.id,
        accountId: settings.purchaseTaxAccountId!,
        debit: taxAmount,
        credit: 0,
        memo: "PPN Masukan",
      });
    }
    purchaseOrderEntries.push({
      journalId: journal.id,
      accountId: settings.purchasePayableAccountId!,
      debit: 0,
      credit: order.totalAmount,
      memo: "Hutang Usaha",
    });
    await tx.journalEntry.createMany({ data: purchaseOrderEntries });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: GL for Stock Adjustment, Work Order completion, and Material Issue is
// posted by `stockJournalService` (src/lib/services/stock-journal.service.ts),
// invoked from the stock hooks (stock-adjustment.hook / work-order.hook /
// material-issue.hook) at the exact point FIFO layers are consumed — so the
// journal uses the REAL consumed cost, not a stored master-cost snapshot.
// Duplicate accounting-hook implementations of those three events were removed
// here: keeping them risked double-posting the same journals. Do NOT re-add
// stock-movement GL in this file; extend stockJournalService instead.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 6. onExpenseApproved
//    Dr. Expense Account (amount)
//    Cr. Paid From Account (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onExpenseApproved(
  expenseId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const expense = await db.expense.findUniqueOrThrow({
    where: { id: expenseId },
  });

  if (!expense.accountId || !expense.paidFromAccountId) return;

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "Expense", referenceId: expenseId },
  });
  if (existing) return;

  await assertPeriodOpen(expense.date ?? new Date());

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx: two concurrent calls both pass the early
    // `findFirst` (returns null) and both open their own $transaction;
    // without this in-tx re-check the second call's `tx.journal.create` trips
    // the @@unique([referenceType, referenceId]) constraint and surfaces as
    // a confusing Prisma P2002 error to the user even though the operation
    // logically succeeded once.
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "Expense", referenceId: expenseId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "EXP", expenseId);

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: expense.date ?? new Date(),
        referenceType: "Expense",
        referenceId: expense.id,
        description: `Pengeluaran: ${expense.description ?? expense.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: expense.amount,
        totalCredit: expense.amount,
        createdBy: userId ?? null,
      },
    });

    // Dr. Akun Biaya + Cr. Akun Sumber Dana (batch — eliminates N+1)
    await tx.journalEntry.createMany({
      data: [
        {
          journalId: journal.id,
          accountId: expense.accountId!,
          debit: expense.amount,
          credit: 0,
          memo: `Biaya: ${expense.description ?? ""}`,
        },
        {
          journalId: journal.id,
          accountId: expense.paidFromAccountId!,
          debit: 0,
          credit: expense.amount,
          memo: "Pembayaran dari Kas/Bank",
        },
      ],
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. onPettyCashCreated
//    IN:  Dr. PettyCash Account, Cr. Source Account
//    OUT: Dr. Expense Account, Cr. PettyCash Account
// ─────────────────────────────────────────────────────────────────────────────

export async function onPettyCashCreated(
  pettyCashId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  if (!settings.pettyCashAccountId) return;

  const pettyCash = await db.pettyCash.findUniqueOrThrow({
    where: { id: pettyCashId },
  });

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "PettyCash", referenceId: pettyCashId },
  });
  if (existing) return;

  // Use the authoritative transaction date. `date` is the user-input transaction
  // date and is always populated; `transactionDate` is an optional legacy field
  // that callers leave null. Previously the code fell back to `new Date()` (today)
  // whenever `transactionDate` was null, which silently bypassed the period lock
  // for back-dated petty-cash entries and posted the journal dated today while
  // the subledger record sat on a closed-period date — corrupting the GL.
  const postingDate = pettyCash.transactionDate ?? pettyCash.date;
  await assertPeriodOpen(postingDate);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx: two concurrent calls both pass the early
    // `findFirst` (returns null) and both open their own $transaction;
    // without this in-tx re-check the second call's `tx.journal.create` trips
    // the @@unique([referenceType, referenceId]) constraint and surfaces as
    // a confusing Prisma P2002 error to the user even though the operation
    // logically succeeded once.
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "PettyCash", referenceId: pettyCashId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "PC", pettyCashId);
    const isInflow = pettyCash.type === "IN";

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: postingDate,
        referenceType: "PettyCash",
        referenceId: pettyCash.id,
        description: isInflow
          ? `Pengisian Kas Kecil ${pettyCash.documentNo}`
          : `Pengeluaran Kas Kecil ${pettyCash.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: pettyCash.amount,
        totalCredit: pettyCash.amount,
        createdBy: userId ?? null,
      },
    });

    // Build the petty-cash lines based on direction, then insert in a single
    // batch — eliminates 2 sequential tx.journalEntry.create round-trips.
    const pettyCashEntries: Prisma.JournalEntryCreateManyInput[] = [];
    if (isInflow) {
      // IN: Dr. PettyCash, Cr. Source Account
      const sourceAccountId =
        pettyCash.sourceAccountId ?? settings.cashBankAccountId;
      if (!sourceAccountId) {
        throw new Error(
          "Akun sumber dana (sourceAccountId/cashBankAccountId) belum dikonfigurasi untuk pengisian kas kecil",
        );
      }

      pettyCashEntries.push(
        {
          journalId: journal.id,
          accountId: settings.pettyCashAccountId!,
          debit: pettyCash.amount,
          credit: 0,
          memo: "Pengisian Kas Kecil",
        },
        {
          journalId: journal.id,
          accountId: sourceAccountId,
          debit: 0,
          credit: pettyCash.amount,
          memo: "Sumber Dana Kas Kecil",
        },
      );
    } else {
      // OUT: Dr. Expense Account, Cr. PettyCash
      const expenseAccountId =
        pettyCash.expenseAccountId ?? settings.generalExpenseAccountId;
      if (!expenseAccountId) {
        throw new Error(
          "Akun beban (expenseAccountId/generalExpenseAccountId) belum dikonfigurasi untuk pengeluaran kas kecil",
        );
      }

      pettyCashEntries.push(
        {
          journalId: journal.id,
          accountId: expenseAccountId,
          debit: pettyCash.amount,
          credit: 0,
          memo: `Pengeluaran: ${pettyCash.description ?? ""}`,
        },
        {
          journalId: journal.id,
          accountId: settings.pettyCashAccountId!,
          debit: 0,
          credit: pettyCash.amount,
          memo: "Pengeluaran Kas Kecil",
        },
      );
    }
    await tx.journalEntry.createMany({ data: pettyCashEntries });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. onSalesReturnCompleted
//    Dr. Sales Return (amount)
//    Cr. Receivable (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onSalesReturnCompleted(
  returnId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  if (
    !settings.salesReturnAccountId ||
    !settings.salesReceivableAccountId ||
    !settings.inventoryAccountId
  )
    return;

  const salesReturn = await db.salesReturn.findUniqueOrThrow({
    where: { id: returnId },
    include: { items: true },
  });

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "SalesReturn", referenceId: returnId },
  });
  if (existing) return;

  // Revenue side valued at the selling price (reduces A/R by what was invoiced);
  // goods come back into inventory at cost. The margin nets into the Sales Return
  // contra-revenue account. This single journal owns all GL for a sales return
  // (the stock hook only moves stock now).
  const priceTotal = salesReturn.items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.price ?? 0),
    0,
  );
  const costTotal = salesReturn.items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.cost ?? 0),
    0,
  );
  if (priceTotal <= 0 && costTotal <= 0) return;

  await assertPeriodOpen(new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "SalesReturn", referenceId: returnId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "SR", returnId);

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: new Date(),
        referenceType: "SalesReturn",
        referenceId: salesReturn.id,
        description: `Retur Penjualan ${salesReturn.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: priceTotal + costTotal,
        totalCredit: priceTotal + costTotal,
        createdBy: userId ?? null,
      },
    });

    // Dr. Retur Penjualan (harga jual) + Cr. Piutang (harga jual) +
    // Dr. Persediaan (cost) + Cr. Retur Penjualan (cost) — batch eliminates 4
    // sequential tx.journalEntry.create round-trips.
    await tx.journalEntry.createMany({
      data: [
        {
          journalId: journal.id,
          accountId: settings.salesReturnAccountId!,
          debit: priceTotal,
          credit: 0,
          memo: "Retur Penjualan",
        },
        {
          journalId: journal.id,
          accountId: settings.salesReceivableAccountId!,
          debit: 0,
          credit: priceTotal,
          memo: "Pengurangan Piutang (Retur)",
        },
        {
          journalId: journal.id,
          accountId: settings.inventoryAccountId!,
          debit: costTotal,
          credit: 0,
          memo: "Persediaan Masuk (Retur)",
        },
        {
          journalId: journal.id,
          accountId: settings.salesReturnAccountId!,
          debit: 0,
          credit: costTotal,
          memo: "HPP Retur Masuk Kembali",
        },
      ],
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. onPurchaseReturnProcessed
//    Dr. Payable (amount)
//    Cr. Inventory (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onPurchaseReturnProcessed(
  returnId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  if (!settings.purchasePayableAccountId || !settings.inventoryAccountId)
    return;

  const purchaseReturn = await db.purchaseReturn.findUniqueOrThrow({
    where: { id: returnId },
    include: { items: true },
  });

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "PurchaseReturn", referenceId: returnId },
  });
  if (existing) return;

  // AP relief = agreed return price (what the vendor credits back).
  const totalAmount = purchaseReturn.items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.cost),
    0,
  );
  if (totalAmount <= 0) return;

  // Inventory relief = ACTUAL FIFO carrying cost that left stock, read back from
  // the OUT stock moves the stock hook (purchase-return.hook) created. This is
  // what was really removed from inventory; it can differ from the agreed return
  // price when purchase prices drifted since the goods were received.
  const outMoves = await db.stockMove.findMany({
    where: {
      referenceType: "PurchaseReturn",
      referenceId: returnId,
      impact: "OUT",
    },
    select: { qty: true, cost: true },
  });
  const inventoryAmount = outMoves.reduce(
    (sum, m) => sum + Number(m.qty) * Number(m.cost),
    0,
  );

  await assertPeriodOpen(new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double check
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "PurchaseReturn", referenceId: returnId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "PR", returnId);

    // Build double-entry:
    //   Dr Hutang Usaha     = return price (AP reduced by what the vendor credits)
    //   Cr Persediaan       = FIFO carrying cost actually relieved from stock
    //   Dr/Cr Selisih Retur = price variance (return price vs carrying cost)
    // When no variance account is configured or the carrying cost is unavailable,
    // fall back to crediting Inventory at the return price (old behavior) so the
    // journal stays balanced.
    const varianceAccount = settings.purchaseReturnAccountId ?? null;
    const useVariance =
      varianceAccount != null &&
      inventoryAmount > 0 &&
      Math.abs(totalAmount - inventoryAmount) > 0.001;

    const inventoryCredit = useVariance ? inventoryAmount : totalAmount;
    const variance = totalAmount - inventoryAmount; // >0: gain (Cr), <0: loss (Dr)

    const entries: {
      accountId: number;
      debit: number;
      credit: number;
      memo: string;
    }[] = [
      {
        accountId: settings.purchasePayableAccountId!,
        debit: totalAmount,
        credit: 0,
        memo: "Pengurangan Hutang (Retur)",
      },
      {
        accountId: settings.inventoryAccountId!,
        debit: 0,
        credit: inventoryCredit,
        memo: "Pengembalian Persediaan (biaya FIFO)",
      },
    ];

    if (useVariance) {
      if (variance > 0) {
        // Return price > carrying cost → credit the variance (gain on return).
        entries.push({
          accountId: varianceAccount!,
          debit: 0,
          credit: variance,
          memo: "Selisih harga retur pembelian",
        });
      } else {
        // Return price < carrying cost → debit the variance (loss on return).
        entries.push({
          accountId: varianceAccount!,
          debit: -variance,
          credit: 0,
          memo: "Selisih harga retur pembelian",
        });
      }
    }

    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    // Balance guard: this hook writes journalEntry rows directly, bypassing
    // JournalService.createJournal's validation. The variance branches above
    // are provably balanced, but guard explicitly so a future edit can never
    // silently persist an unbalanced purchase-return journal.
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error(
        `Jurnal retur pembelian tidak balance. Debit: ${totalDebit.toFixed(2)}, Kredit: ${totalCredit.toFixed(2)}.`,
      );
    }

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: new Date(),
        referenceType: "PurchaseReturn",
        referenceId: purchaseReturn.id,
        description: `Retur Pembelian ${purchaseReturn.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit,
        totalCredit,
        createdBy: userId ?? null,
      },
    });

    if (entries.length > 0) {
      await tx.journalEntry.createMany({
        data: entries.map((e) => ({
          journalId: journal.id,
          accountId: e.accountId,
          debit: e.debit,
          credit: e.credit,
          memo: e.memo,
        })),
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. onDownPaymentReceived
//     Dr. Bank/Cash (amount)
//     Cr. Uang Muka Penjualan / Unearned Revenue (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onDownPaymentReceived(
  dpId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  // Fix #27: Harus punya cashBankAccountId untuk Dr. Bank/Cash
  if (!settings.cashBankAccountId || !settings.salesReceivableAccountId) return;

  const dp = await db.downPayment.findUniqueOrThrow({
    where: { id: dpId },
  });

  const existing = await db.journal.findFirst({
    where: { referenceType: "DownPayment", referenceId: dpId },
  });
  if (existing) return;

  await assertPeriodOpen(dp.paymentDate || new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx: two concurrent calls both pass the early
    // `findFirst` (returns null) and both open their own $transaction;
    // without this in-tx re-check the second call's `tx.journal.create` trips
    // the @@unique([referenceType, referenceId]) constraint and surfaces as
    // a confusing Prisma P2002 error to the user even though the operation
    // logically succeeded once.
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "DownPayment", referenceId: dpId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "DP", dpId);

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: dp.paymentDate || new Date(),
        referenceType: "DownPayment",
        referenceId: dp.id,
        description: `Down Payment ${dp.documentNo || dpId}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: dp.amount,
        totalCredit: dp.amount,
        createdBy: userId,
        entries: {
          create: [
            // Fix #27: Dr. Bank/Cash (bukan Piutang)
            {
              accountId: settings.cashBankAccountId!,
              debit: dp.amount,
              credit: 0,
              memo: "Bank/Cash received",
            },
            // Fix #27: Cr. Uang Muka Penjualan (bukan Revenue)
            {
              accountId: settings.salesReceivableAccountId!,
              debit: 0,
              credit: dp.amount,
              memo: "Uang Muka Penjualan",
            },
          ],
        },
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. onVendorBillPosted
//     Dr. Expense/Inventory (amount)
//     Cr. Accounts Payable (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onVendorBillPosted(
  billId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  if (!settings.purchasePayableAccountId) return;

  const bill = await db.vendorBill.findUniqueOrThrow({
    where: { id: billId },
  });

  const existing = await db.journal.findFirst({
    where: { referenceType: "VendorBill", referenceId: billId },
  });
  if (existing) return;

  await assertPeriodOpen(bill.date, txClient);

  // A bill linked to a PO that already had goods received is "goods-based": the
  // goods already hit Inventory at GR (Dr Inventory / Cr clearing). The bill must
  // therefore DEBIT the clearing account (purchaseInventory) to clear it — not an
  // expense account — otherwise the same goods are counted twice (Inventory + Expense)
  // and the clearing account is never relieved. Service/expense bills (no GR) keep
  // debiting the expense account.
  const grandTotal = Number(bill.grandTotal);
  const goodsBased =
    bill.purchaseOrderId != null &&
    settings.purchaseInventoryAccountId != null &&
    (await db.goodsReceipt.count({
      where: { purchaseOrderId: bill.purchaseOrderId },
    })) > 0;

  const debitEntries: {
    accountId: number;
    debit: number;
    credit: number;
    memo: string;
  }[] = [];
  if (goodsBased) {
    const taxAmount = settings.purchaseTaxAccountId ? Number(bill.tax ?? 0) : 0;
    const clearingAmount = grandTotal - taxAmount;
    debitEntries.push({
      accountId: settings.purchaseInventoryAccountId!,
      debit: clearingAmount,
      credit: 0,
      memo: "Clearing penerimaan barang",
    });
    if (taxAmount > 0) {
      debitEntries.push({
        accountId: settings.purchaseTaxAccountId!,
        debit: taxAmount,
        credit: 0,
        memo: "PPN Masukan",
      });
    }
  } else {
    // Service/expense bill (no goods receipt): debit the expense account. Fail
    // closed when it is unconfigured rather than falling back to the payable
    // account — that fallback produced a net-zero Dr AP / Cr AP entry that
    // looked "posted" but never actually recognised the liability in the GL.
    // Mirrors the fail-closed convention used by onPettyCashCreated/onExpenseApproved.
    if (!settings.purchaseExpenseAccountId) {
      throw new Error(
        "Akun beban pembelian (purchaseExpenseAccountId) belum dikonfigurasi untuk tagihan jasa/biaya",
      );
    }
    debitEntries.push({
      accountId: settings.purchaseExpenseAccountId,
      debit: grandTotal,
      credit: 0,
      memo: "Purchase expense",
    });
  }

  await executeInTx(txClient, async (tx) => {
    // double check
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "VendorBill", referenceId: billId },
    });
    if (existingInTx) return;

    // Fix: Re-fetch the bill inside the transaction under a lock to prevent
    // stale data from being used in the journal.
    const b = await tx.vendorBill.findUnique({
      where: { id: billId },
      select: {
        id: true,
        grandTotal: true,
        tax: true,
        date: true,
        documentNo: true,
      },
    });
    if (!b) throw new Error("Bill tidak ditemukan");

    const latestGrandTotal = Number(b.grandTotal);
    const latestTaxAmount = settings.purchaseTaxAccountId
      ? Number(b.tax ?? 0)
      : 0;

    const journalNumber = await generateJournalNumber(tx, "BILL", billId);

    const latestDebitEntries: {
      accountId: number;
      debit: number;
      credit: number;
      memo: string;
    }[] = [];
    if (goodsBased) {
      const clearingAmount = latestGrandTotal - latestTaxAmount;
      latestDebitEntries.push({
        accountId: settings.purchaseInventoryAccountId!,
        debit: clearingAmount,
        credit: 0,
        memo: "Clearing penerimaan barang",
      });
      if (latestTaxAmount > 0) {
        latestDebitEntries.push({
          accountId: settings.purchaseTaxAccountId!,
          debit: latestTaxAmount,
          credit: 0,
          memo: "PPN Masukan",
        });
      }
    } else {
      if (!settings.purchaseExpenseAccountId) {
        throw new Error(
          "Akun beban pembelian (purchaseExpenseAccountId) belum dikonfigurasi untuk tagihan jasa/biaya",
        );
      }
      latestDebitEntries.push({
        accountId: settings.purchaseExpenseAccountId,
        debit: latestGrandTotal,
        credit: 0,
        memo: "Purchase expense",
      });
    }

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: b.date,
        referenceType: "VendorBill",
        referenceId: b.id,
        description: `Vendor Bill ${b.documentNo}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: b.grandTotal,
        totalCredit: b.grandTotal,
        createdBy: userId,
        entries: {
          create: [
            ...latestDebitEntries,
            {
              accountId: settings.purchasePayableAccountId!,
              debit: 0,
              credit: latestGrandTotal,
              memo: "Accounts Payable",
            },
          ],
        },
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. onVendorPaymentCreated
//     Dr. Accounts Payable (amount)
//     Cr. Bank/Cash (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onVendorPaymentCreated(
  paymentId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  // Fix #28: Harus punya cashBankAccountId untuk Cr. Bank/Cash
  if (!settings.purchasePayableAccountId || !settings.cashBankAccountId) return;

  const payment = await db.vendorPayment.findUniqueOrThrow({
    where: { id: paymentId },
  });

  const existing = await db.journal.findFirst({
    where: { referenceType: "VendorPayment", referenceId: paymentId },
  });
  if (existing) return;

  await assertPeriodOpen(payment.paymentDate || new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double check
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "VendorPayment", referenceId: paymentId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "VP", paymentId);

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: payment.paymentDate || new Date(),
        referenceType: "VendorPayment",
        referenceId: payment.id,
        description: `Vendor Payment ${payment.documentNo || paymentId}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: payment.amount,
        totalCredit: payment.amount,
        createdBy: userId,
        entries: {
          create: [
            // Dr. Hutang Usaha
            {
              accountId: settings.purchasePayableAccountId!,
              debit: payment.amount,
              credit: 0,
              memo: "Accounts Payable",
            },
            // Fix #28: Cr. Bank/Cash (bukan salesReceivableAccountId!)
            {
              accountId: payment.accountId ?? settings.cashBankAccountId!,
              debit: 0,
              credit: payment.amount,
              memo: "Bank/Cash paid",
            },
          ],
        },
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. onPayrollPaid
//    Dr. Salary Expense (netSalary + statutory)
//    Cr. Bank/Cash (netSalary)
//    Cr. Tax/BPJS Payable (statutory)
// ─────────────────────────────────────────────────────────────────────────────

export async function onPayrollPaid(
  payrollId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  if (!settings.salaryExpenseAccountId || !settings.payrollBankAccountId)
    return;

  // Idempotency
  const existing = await db.journal.findFirst({
    where: { referenceType: "Payroll", referenceId: payrollId },
  });
  if (existing) return;

  const payroll = await db.payroll.findUniqueOrThrow({
    where: { id: payrollId },
  });

  const netSalary = Number(payroll.netSalary) || 0;
  const statutory =
    Number(payroll.bpjsHealthEmployee ?? 0) +
    Number(payroll.bpjsEmploymentEmployee ?? 0) +
    Number(payroll.pph21 ?? 0);
  const totalExpense = netSalary + statutory;

  if (totalExpense <= 0) return;

  await assertPeriodOpen(payroll.paymentDate ?? new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx: two concurrent calls both pass the early
    // `findFirst` (returns null) and both open their own $transaction;
    // without this in-tx re-check the second call's `tx.journal.create` trips
    // the @@unique([referenceType, referenceId]) constraint and surfaces as
    // a confusing Prisma P2002 error to the user even though the operation
    // logically succeeded once.
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "Payroll", referenceId: payrollId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "PAY", payrollId);

    const entries: Array<{
      accountId: number;
      debit: number;
      credit: number;
      memo: string;
    }> = [
      // Dr. Salary Expense
      {
        accountId: settings.salaryExpenseAccountId!,
        debit: totalExpense,
        credit: 0,
        memo: "Beban Gaji",
      },
      // Cr. Bank/Cash (net paid to employee)
      {
        accountId: settings.payrollBankAccountId!,
        debit: 0,
        credit: netSalary,
        memo: "Pembayaran Gaji",
      },
    ];

    // Cr. Salaries Payable for statutory (BPJS+PPh) if account configured
    if (statutory > 0 && settings.salariesPayableAccountId) {
      entries.push({
        accountId: settings.salariesPayableAccountId,
        debit: 0,
        credit: statutory,
        memo: "BPJS + PPh21 karyawan",
      });
    } else if (statutory > 0) {
      // Fallback: credit to same bank account
      entries[1].credit += statutory;
    }

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: payroll.paymentDate ?? new Date(),
        referenceType: "Payroll",
        referenceId: payrollId,
        description: `Penggajian ${payroll.documentNo}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: totalExpense,
        totalCredit: totalExpense,
        createdBy: userId ?? null,
        entries: {
          create: entries,
        },
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// onEmployeeLoanDisbursed
//   Dr. Piutang Karyawan (employeeReceivable)   total
//   Cr. Bank/Kas Payroll (payrollBank)          total
// Posted when an employee loan becomes active (cash disbursed to the employee).
// Mirrors YaraERP EmployeeLoanObserver. Idempotent on (referenceType, referenceId).
// ─────────────────────────────────────────────────────────────────────────────
export async function onEmployeeLoanDisbursed(
  loanId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  const settings = await getSystemSettings(db);
  // Need both legs configured; otherwise skip GL (loan row still created).
  if (!settings.employeeReceivableAccountId || !settings.payrollBankAccountId)
    return;

  const loan = await db.employeeLoan.findUniqueOrThrow({ where: { id: loanId } });
  const amount = Number(loan.totalAmount);
  if (amount <= 0) return;

  const existing = await db.journal.findFirst({
    where: { referenceType: "EmployeeLoan", referenceId: loanId },
  });
  if (existing) return;

  await assertPeriodOpen(loan.loanDate || new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "EmployeeLoan", referenceId: loanId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "LOAN", loanId);

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: loan.loanDate || new Date(),
        referenceType: "EmployeeLoan",
        referenceId: loan.id,
        description: `Pencairan pinjaman karyawan #${loanId}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: amount,
        totalCredit: amount,
        createdBy: userId,
        entries: {
          create: [
            {
              accountId: settings.employeeReceivableAccountId!,
              debit: amount,
              credit: 0,
              memo: "Piutang Karyawan (pinjaman)",
            },
            {
              accountId: settings.payrollBankAccountId!,
              debit: 0,
              credit: amount,
              memo: "Pencairan pinjaman",
            },
          ],
        },
      },
    });
  });
}
