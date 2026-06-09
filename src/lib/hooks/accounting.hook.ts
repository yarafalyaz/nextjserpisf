
import { prisma, TxClient } from "@/lib/db/prisma";
import { consumeFifoLayers } from "@/lib/services/inventory-fifo";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { toBaseFactor } from "@/lib/services/uom.service";

/**
 * Accounting Hook - Observer pattern replacement for all accounting journal entries.
 * Setiap fungsi membuat journal entry double-entry yang balanced.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get system settings (account IDs)
// ─────────────────────────────────────────────────────────────────────────────

async function getSystemSettings() {
  const settings = await prisma.systemSetting.findFirst();
  if (!settings) throw new Error("System settings belum dikonfigurasi.");
  return settings;
}

async function generateJournalNumber(
  _tx: TxClient,
  prefix: string,
  referenceId: number
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `${prefix}/${referenceId}/${timestamp}`;
}

/**
 * Delete the journal(s) and their entries linked to a source document.
 * Use when a DRAFT document (vendor bill/payment, down payment, etc.) whose
 * journal was already posted gets deleted/edited, to avoid orphaned GL entries.
 */
export async function deleteJournalByReference(
  referenceType: string,
  referenceId: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
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
  referenceId: number | number[]
): Promise<void> {
  const journals = await tx.journal.findMany({
    where: {
      referenceType: Array.isArray(referenceType) ? { in: referenceType } : referenceType,
      referenceId: Array.isArray(referenceId) ? { in: referenceId } : referenceId,
    },
    select: { id: true },
  });
  if (journals.length === 0) return;
  const journalIds = journals.map((j) => j.id);
  await tx.journalEntry.deleteMany({ where: { journalId: { in: journalIds } } });
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
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.salesReceivableAccountId || !settings.salesRevenueAccountId) return;

  const invoice = await prisma.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true },
  });

  // Idempotency: check if journal already exists
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "SalesInvoice", referenceId: invoiceId },
  });
  if (existing) return;

  await assertPeriodOpen(invoice.date);

  await prisma.$transaction(async (tx) => {
    // Serialize concurrent postings of the same invoice and re-check idempotency
    // under the row lock so two parallel postInvoice calls cannot both create a
    // journal + double the stock-out.
    await tx.$queryRaw`SELECT id FROM sales_invoices WHERE id = ${invoiceId} FOR UPDATE`;
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "SalesInvoice", referenceId: invoiceId },
    });
    if (existingInTx) return;

    const journalNumber = await generateJournalNumber(tx, "INV", invoiceId);

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
        createdBy: userId ?? null,
      },
    });

    const taxAmount = Number(invoice.taxAmount ?? 0);
    const hasTaxAccount = taxAmount > 0 && !!settings.salesTaxAccountId;
    // Keep the journal balanced: only split out tax when a tax account exists,
    // otherwise revenue absorbs the full amount (credit total == debit total).
    const revenueCredit = hasTaxAccount
      ? Number(invoice.totalAmount) - taxAmount
      : Number(invoice.totalAmount);

    // Dr. Piutang Usaha
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.salesReceivableAccountId!,
        debit: invoice.totalAmount,
        credit: 0,
        memo: "Piutang Usaha",
      },
    });

    // Cr. Pendapatan Penjualan
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.salesRevenueAccountId!,
        debit: 0,
        credit: revenueCredit,
        memo: "Pendapatan Penjualan",
      },
    });

    // Cr. PPN Keluaran (only when a tax account is configured)
    if (hasTaxAccount) {
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.salesTaxAccountId!,
          debit: 0,
          credit: taxAmount,
          memo: "PPN Keluaran",
        },
      });
    }

    // Dr. HPP / Cr. Persediaan + physical stock-out for PRODUCT items.
    // Previously the COGS journal was posted but stock (qtyOnHand + FIFO layers)
    // was never reduced, diverging the GL inventory from the stock subledger.
    // Here we also create StockMove OUT and consume FIFO for stockable products.
    const productItems = invoice.items.filter(
      (it): it is typeof it & { itemId: number } => typeof it.itemId === "number" && Number(it.qty) > 0
    )
    const itemIds = productItems.map((it) => it.itemId)
    const itemRows = itemIds.length
      ? await tx.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, cost: true, isProduct: true, defaultWarehouseId: true },
        })
      : [];
    const itemInfo = new Map(itemRows.map((r) => [r.id, r]));

    let cogsAmount = 0;
    for (const line of productItems) {
      const info = itemInfo.get(line.itemId);
      if (!info || !info.isProduct) continue; // services / non-stock items: no stock-out, no COGS
      // Multi-UoM: convert sold qty to base units for stock-out / COGS.
      const factor = await toBaseFactor(tx, line.itemId, (line as { uom?: string | null }).uom);
      const qty = Number(line.qty) * factor;
      const fallbackUnitCost = factor > 0 ? Number(info.cost ?? 0) / factor : Number(info.cost ?? 0);

      // Lock the item row to serialize concurrent stock-out for the same item,
      // preventing two parallel sales from racing the FIFO layers into negative
      // (oversell/negative-remaining). Mirrors material-issue/work-order hooks.
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${line.itemId} FOR UPDATE`;

      // Decrement on-hand (reflects the sale even if overselling) and consume
      // FIFO layers from the item's default warehouse up to what is available
      // (allowShortfall — a sale is never blocked by stock).
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${qty} WHERE id = ${line.itemId}`;
      const lineSerials = Array.isArray((line as { serialNumbers?: unknown }).serialNumbers)
        ? ((line as { serialNumbers?: unknown[] }).serialNumbers as unknown[]).map((s) => String(s))
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
          documentNo: `SM-INV-${invoice.documentNo}-${line.itemId}`,
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

    if (cogsAmount > 0 && settings.cogsAccountId && settings.inventoryAccountId) {
      const cogsJournalNumber = await generateJournalNumber(tx, "INV-COGS", invoiceId);
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

      await tx.journalEntry.create({
        data: {
          journalId: cogsJournal.id,
          accountId: settings.cogsAccountId,
          debit: cogsAmount,
          credit: 0,
          memo: "Harga Pokok Penjualan",
        },
      });

      await tx.journalEntry.create({
        data: {
          journalId: cogsJournal.id,
          accountId: settings.inventoryAccountId,
          debit: 0,
          credit: cogsAmount,
          memo: "Pengeluaran Persediaan atas Penjualan",
        },
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
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.salesReceivableAccountId) return;

  const payment = await prisma.salesPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { salesInvoice: true },
  });

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "SalesPayment", referenceId: paymentId },
  });
  if (existing) return;

  await assertPeriodOpen(payment.paymentDate ?? new Date());

  await prisma.$transaction(async (tx) => {
    const journalNumber = await generateJournalNumber(tx, "PAY", paymentId);

    // Determine cash/bank account from payment method or default
    const cashAccountId =
      payment.accountId ?? settings.cashBankAccountId;

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

    // Dr. Kas/Bank
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: cashAccountId,
        debit: payment.amount,
        credit: 0,
        memo: "Penerimaan Kas/Bank",
      },
    });

    // Cr. Piutang Usaha
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.salesReceivableAccountId!,
        debit: 0,
        credit: payment.amount,
        memo: "Pelunasan Piutang",
      },
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
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.inventoryAccountId || !settings.purchasePayableAccountId) return;

  const order = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: orderId },
  });

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "PurchaseOrder", referenceId: orderId },
  });
  if (existing) return;

  await assertPeriodOpen(new Date());

  await prisma.$transaction(async (tx) => {
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

    // Dr. Persediaan
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.inventoryAccountId!,
        debit: inventoryDebit,
        credit: 0,
        memo: "Persediaan Masuk",
      },
    });

    // Dr. PPN Masukan (only when an input-tax account is configured)
    if (hasTaxAccount) {
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.purchaseTaxAccountId!,
          debit: taxAmount,
          credit: 0,
          memo: "PPN Masukan",
        },
      });
    }

    // Cr. Hutang Usaha
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.purchasePayableAccountId!,
        debit: 0,
        credit: order.totalAmount,
        memo: "Hutang Usaha",
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. onStockAdjustmentProcessed
//    Positive diff: Dr. Inventory, Cr. Stock Adjustment
//    Negative diff: Dr. Stock Adjustment, Cr. Inventory
// ─────────────────────────────────────────────────────────────────────────────

export async function onStockAdjustmentProcessed(
  adjustmentId: number,
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.inventoryAccountId || !settings.stockAdjustmentAccountId) return;

  const adjustment = await prisma.stockAdjustment.findUniqueOrThrow({
    where: { id: adjustmentId },
    include: { items: true },
  });

  // Idempotency check — covers both IN and OUT journal types
  const existing = await prisma.journal.findFirst({
    where: { referenceType: { in: ["StockAdjustment", "StockAdjustmentOut"] }, referenceId: adjustmentId },
  });
  if (existing) return;

  // Calculate total adjustment value
  let totalPositive = 0;
  let totalNegative = 0;

  for (const item of adjustment.items) {
    const diff = Number(item.actualQty) - Number(item.systemQty);
    const value = Math.abs(diff) * Number(item.unitCost ?? 0);
    if (diff > 0) totalPositive += value;
    else if (diff < 0) totalNegative += value;
  }

  await assertPeriodOpen(new Date());

  await prisma.$transaction(async (tx) => {
    // Journal for positive adjustments (stock increase)
    if (totalPositive > 0) {
      const journalNumber = await generateJournalNumber(tx, "ADJ-IN", adjustmentId);

      const journal = await tx.journal.create({
        data: {
          journalNumber,
          transactionDate: new Date(),
          referenceType: "StockAdjustment",
          referenceId: adjustment.id,
          description: `Penyesuaian Stok Masuk ${adjustment.documentNo}`,
          type: "ADJUSTMENT",
          status: "POSTED",
          totalDebit: totalPositive,
          totalCredit: totalPositive,
          createdBy: userId ?? null,
        },
      });

      // Dr. Inventory
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.inventoryAccountId!,
          debit: totalPositive,
          credit: 0,
          memo: "Penyesuaian Stok Masuk",
        },
      });

      // Cr. Stock Adjustment
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.stockAdjustmentAccountId!,
          debit: 0,
          credit: totalPositive,
          memo: "Selisih Penyesuaian Stok",
        },
      });
    }

    // Journal for negative adjustments (stock decrease)
    if (totalNegative > 0) {
      const journalNumber = await generateJournalNumber(tx, "ADJ-OUT", adjustmentId);

      const journal = await tx.journal.create({
        data: {
          journalNumber,
          transactionDate: new Date(),
          referenceType: "StockAdjustmentOut",
          referenceId: adjustment.id,
          description: `Penyesuaian Stok Keluar ${adjustment.documentNo}`,
          type: "ADJUSTMENT",
          status: "POSTED",
          totalDebit: totalNegative,
          totalCredit: totalNegative,
          createdBy: userId ?? null,
        },
      });

      // Dr. Stock Adjustment
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.stockAdjustmentAccountId!,
          debit: totalNegative,
          credit: 0,
          memo: "Selisih Penyesuaian Stok",
        },
      });

      // Cr. Inventory
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.inventoryAccountId!,
          debit: 0,
          credit: totalNegative,
          memo: "Penyesuaian Stok Keluar",
        },
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. onWorkOrderCompleted
//    Dr. WIP / Finished Goods (total cost)
//    Cr. Inventory / Raw Materials (total cost)
// ─────────────────────────────────────────────────────────────────────────────

export async function onWorkOrderCompleted(
  workOrderId: number,
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.wipAccountId || !settings.inventoryAccountId) return;

  const workOrder = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: { items: true },
  });

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "WorkOrder", referenceId: workOrderId },
  });
  if (existing) return;

  // Calculate total material cost
  const totalCost = workOrder.items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.cost ?? 0),
    0
  );

  if (totalCost <= 0) return;

  await assertPeriodOpen(new Date());

  await prisma.$transaction(async (tx) => {
    const journalNumber = await generateJournalNumber(tx, "WO", workOrderId);

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: new Date(),
        referenceType: "WorkOrder",
        referenceId: workOrder.id,
        description: `Penyelesaian Work Order ${workOrder.documentNo}`,
        type: "PRODUCTION",
        status: "POSTED",
        totalDebit: totalCost,
        totalCredit: totalCost,
        createdBy: userId ?? null,
      },
    });

    // Dr. WIP / Barang Dalam Proses
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.wipAccountId!,
        debit: totalCost,
        credit: 0,
        memo: "Barang Dalam Proses",
      },
    });

    // Cr. Persediaan Bahan Baku
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.inventoryAccountId!,
        debit: 0,
        credit: totalCost,
        memo: "Pemakaian Bahan Baku",
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. onExpenseApproved
//    Dr. Expense Account (amount)
//    Cr. Paid From Account (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onExpenseApproved(
  expenseId: number,
  userId?: number
): Promise<void> {
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
  });

  if (!expense.accountId || !expense.paidFromAccountId) return;

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "Expense", referenceId: expenseId },
  });
  if (existing) return;

  await assertPeriodOpen(expense.date ?? new Date());

  await prisma.$transaction(async (tx) => {
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

    // Dr. Akun Biaya
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: expense.accountId!,
        debit: expense.amount,
        credit: 0,
        memo: `Biaya: ${expense.description ?? ""}`,
      },
    });

    // Cr. Akun Sumber Dana
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: expense.paidFromAccountId!,
        debit: 0,
        credit: expense.amount,
        memo: "Pembayaran dari Kas/Bank",
      },
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
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.pettyCashAccountId) return;

  const pettyCash = await prisma.pettyCash.findUniqueOrThrow({
    where: { id: pettyCashId },
  });

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "PettyCash", referenceId: pettyCashId },
  });
  if (existing) return;

  await assertPeriodOpen(pettyCash.transactionDate ?? new Date());

  await prisma.$transaction(async (tx) => {
    const journalNumber = await generateJournalNumber(tx, "PC", pettyCashId);
    const isInflow = pettyCash.type === "IN";

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: pettyCash.transactionDate ?? new Date(),
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

    if (isInflow) {
      // IN: Dr. PettyCash, Cr. Source Account
      const sourceAccountId =
        pettyCash.sourceAccountId ?? settings.cashBankAccountId;
      if (!sourceAccountId) {
        throw new Error("Akun sumber dana (sourceAccountId/cashBankAccountId) belum dikonfigurasi untuk pengisian kas kecil");
      }

      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.pettyCashAccountId!,
          debit: pettyCash.amount,
          credit: 0,
          memo: "Pengisian Kas Kecil",
        },
      });

      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: sourceAccountId,
          debit: 0,
          credit: pettyCash.amount,
          memo: "Sumber Dana Kas Kecil",
        },
      });
    } else {
      // OUT: Dr. Expense Account, Cr. PettyCash
      const expenseAccountId =
        pettyCash.expenseAccountId ?? settings.generalExpenseAccountId;
      if (!expenseAccountId) {
        throw new Error("Akun beban (expenseAccountId/generalExpenseAccountId) belum dikonfigurasi untuk pengeluaran kas kecil");
      }

      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: expenseAccountId,
          debit: pettyCash.amount,
          credit: 0,
          memo: `Pengeluaran: ${pettyCash.description ?? ""}`,
        },
      });

      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.pettyCashAccountId!,
          debit: 0,
          credit: pettyCash.amount,
          memo: "Pengeluaran Kas Kecil",
        },
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. onSalesReturnCompleted
//    Dr. Sales Return (amount)
//    Cr. Receivable (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onSalesReturnCompleted(
  returnId: number,
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.salesReturnAccountId || !settings.salesReceivableAccountId || !settings.inventoryAccountId) return;

  const salesReturn = await prisma.salesReturn.findUniqueOrThrow({
    where: { id: returnId },
    include: { items: true },
  });

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "SalesReturn", referenceId: returnId },
  });
  if (existing) return;

  // Revenue side valued at the selling price (reduces A/R by what was invoiced);
  // goods come back into inventory at cost. The margin nets into the Sales Return
  // contra-revenue account. This single journal owns all GL for a sales return
  // (the stock hook only moves stock now).
  const priceTotal = salesReturn.items.reduce((sum, item) => sum + Number(item.qty) * Number(item.price ?? 0), 0);
  const costTotal = salesReturn.items.reduce((sum, item) => sum + Number(item.qty) * Number(item.cost ?? 0), 0);
  if (priceTotal <= 0 && costTotal <= 0) return;

  await assertPeriodOpen(new Date());

  await prisma.$transaction(async (tx) => {
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

    // Dr. Retur Penjualan (harga jual) — contra-revenue
    await tx.journalEntry.create({
      data: { journalId: journal.id, accountId: settings.salesReturnAccountId!, debit: priceTotal, credit: 0, memo: "Retur Penjualan" },
    });
    // Cr. Piutang Usaha (harga jual)
    await tx.journalEntry.create({
      data: { journalId: journal.id, accountId: settings.salesReceivableAccountId!, debit: 0, credit: priceTotal, memo: "Pengurangan Piutang (Retur)" },
    });
    // Dr. Persediaan (cost) — barang masuk kembali
    await tx.journalEntry.create({
      data: { journalId: journal.id, accountId: settings.inventoryAccountId!, debit: costTotal, credit: 0, memo: "Persediaan Masuk (Retur)" },
    });
    // Cr. Retur Penjualan (cost) — offset HPP keluar dari contra-revenue
    await tx.journalEntry.create({
      data: { journalId: journal.id, accountId: settings.salesReturnAccountId!, debit: 0, credit: costTotal, memo: "HPP Retur Masuk Kembali" },
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
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.purchasePayableAccountId || !settings.inventoryAccountId) return;

  const purchaseReturn = await prisma.purchaseReturn.findUniqueOrThrow({
    where: { id: returnId },
    include: { items: true },
  });

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "PurchaseReturn", referenceId: returnId },
  });
  if (existing) return;

  // Compute total from items (PurchaseReturn has no totalAmount field)
  const totalAmount = purchaseReturn.items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.cost),
    0
  );
  if (totalAmount <= 0) return;

  await assertPeriodOpen(new Date());

  await prisma.$transaction(async (tx) => {
    const journalNumber = await generateJournalNumber(tx, "PR", returnId);

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: new Date(),
        referenceType: "PurchaseReturn",
        referenceId: purchaseReturn.id,
        description: `Retur Pembelian ${purchaseReturn.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: totalAmount,
        totalCredit: totalAmount,
        createdBy: userId ?? null,
      },
    });

    // Dr. Hutang Usaha
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.purchasePayableAccountId!,
        debit: totalAmount,
        credit: 0,
        memo: "Pengurangan Hutang (Retur)",
      },
    });

    // Cr. Persediaan
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.inventoryAccountId!,
        debit: 0,
        credit: totalAmount,
        memo: "Pengembalian Persediaan",
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. onMaterialIssueCompleted
//     Dr. Material Expense / COGS (total cost)
//     Cr. Inventory (total cost)
// ─────────────────────────────────────────────────────────────────────────────

export async function onMaterialIssueCompleted(
  issueId: number,
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.materialExpenseAccountId || !settings.inventoryAccountId) return;

  const issue = await prisma.materialIssue.findUniqueOrThrow({
    where: { id: issueId },
    include: { items: true },
  });

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "MaterialIssue", referenceId: issueId },
  });
  if (existing) return;

  // Calculate total cost
  const totalCost = issue.items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.cost ?? 0),
    0
  );

  if (totalCost <= 0) return;

  await assertPeriodOpen(new Date());

  await prisma.$transaction(async (tx) => {
    const journalNumber = await generateJournalNumber(tx, "MI", issueId);

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: new Date(),
        referenceType: "MaterialIssue",
        referenceId: issue.id,
        description: `Pengeluaran Material ${issue.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: totalCost,
        totalCredit: totalCost,
        createdBy: userId ?? null,
      },
    });

    // Dr. Biaya Material
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.materialExpenseAccountId!,
        debit: totalCost,
        credit: 0,
        memo: "Biaya Pemakaian Material",
      },
    });

    // Cr. Persediaan
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.inventoryAccountId!,
        debit: 0,
        credit: totalCost,
        memo: "Pengeluaran Persediaan",
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. onDownPaymentReceived
//     Dr. Bank/Cash (amount)
//     Cr. Uang Muka Penjualan / Unearned Revenue (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onDownPaymentReceived(
  dpId: number,
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  // Fix #27: Harus punya cashBankAccountId untuk Dr. Bank/Cash
  if (!settings.cashBankAccountId || !settings.salesReceivableAccountId) return;

  const dp = await prisma.downPayment.findUniqueOrThrow({
    where: { id: dpId },
  });

  const existing = await prisma.journal.findFirst({
    where: { referenceType: "DownPayment", referenceId: dpId },
  });
  if (existing) return;

  await assertPeriodOpen(dp.paymentDate || new Date());

  await prisma.$transaction(async (tx) => {
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
            { accountId: settings.cashBankAccountId!, debit: dp.amount, credit: 0, memo: "Bank/Cash received" },
            // Fix #27: Cr. Uang Muka Penjualan (bukan Revenue)
            { accountId: settings.salesReceivableAccountId!, debit: 0, credit: dp.amount, memo: "Uang Muka Penjualan" },
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
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.purchasePayableAccountId) return;

  const bill = await prisma.vendorBill.findUniqueOrThrow({
    where: { id: billId },
  });

  const existing = await prisma.journal.findFirst({
    where: { referenceType: "VendorBill", referenceId: billId },
  });
  if (existing) return;

  await assertPeriodOpen(bill.date);

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
    (await prisma.goodsReceipt.count({ where: { purchaseOrderId: bill.purchaseOrderId } })) > 0;

  const debitEntries: { accountId: number; debit: number; credit: number; memo: string }[] = [];
  if (goodsBased) {
    const taxAmount = settings.purchaseTaxAccountId ? Number(bill.tax ?? 0) : 0;
    const clearingAmount = grandTotal - taxAmount;
    debitEntries.push({ accountId: settings.purchaseInventoryAccountId!, debit: clearingAmount, credit: 0, memo: "Clearing penerimaan barang" });
    if (taxAmount > 0) {
      debitEntries.push({ accountId: settings.purchaseTaxAccountId!, debit: taxAmount, credit: 0, memo: "PPN Masukan" });
    }
  } else {
    debitEntries.push({ accountId: settings.purchaseExpenseAccountId || settings.purchasePayableAccountId!, debit: grandTotal, credit: 0, memo: "Purchase expense" });
  }

  await prisma.$transaction(async (tx) => {
    const journalNumber = await generateJournalNumber(tx, "BILL", billId);

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: bill.date,
        referenceType: "VendorBill",
        referenceId: bill.id,
        description: `Vendor Bill ${bill.documentNo}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: bill.grandTotal,
        totalCredit: bill.grandTotal,
        createdBy: userId,
        entries: {
          create: [
            ...debitEntries,
            { accountId: settings.purchasePayableAccountId!, debit: 0, credit: grandTotal, memo: "Accounts Payable" },
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
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  // Fix #28: Harus punya cashBankAccountId untuk Cr. Bank/Cash
  if (!settings.purchasePayableAccountId || !settings.cashBankAccountId) return;

  const payment = await prisma.vendorPayment.findUniqueOrThrow({
    where: { id: paymentId },
  });

  const existing = await prisma.journal.findFirst({
    where: { referenceType: "VendorPayment", referenceId: paymentId },
  });
  if (existing) return;

  await assertPeriodOpen(payment.paymentDate || new Date());

  await prisma.$transaction(async (tx) => {
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
            { accountId: settings.purchasePayableAccountId!, debit: payment.amount, credit: 0, memo: "Accounts Payable" },
            // Fix #28: Cr. Bank/Cash (bukan salesReceivableAccountId!)
            { accountId: payment.accountId ?? settings.cashBankAccountId!, debit: 0, credit: payment.amount, memo: "Bank/Cash paid" },
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
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.salaryExpenseAccountId || !settings.payrollBankAccountId) return;

  // Idempotency
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "Payroll", referenceId: payrollId },
  });
  if (existing) return;

  const payroll = await prisma.payroll.findUniqueOrThrow({
    where: { id: payrollId },
  });

  const netSalary = Number(payroll.netSalary) || 0;
  const statutory = Number(payroll.bpjsHealthEmployee ?? 0) + Number(payroll.bpjsEmploymentEmployee ?? 0) + Number(payroll.pph21 ?? 0);
  const totalExpense = netSalary + statutory;

  if (totalExpense <= 0) return;

  await assertPeriodOpen(payroll.paymentDate ?? new Date());

  await prisma.$transaction(async (tx) => {
    const journalNumber = await generateJournalNumber(tx, "PAY", payrollId);

    const entries: Array<{ accountId: number; debit: number; credit: number; memo: string }> = [
      // Dr. Salary Expense
      { accountId: settings.salaryExpenseAccountId!, debit: totalExpense, credit: 0, memo: "Beban Gaji" },
      // Cr. Bank/Cash (net paid to employee)
      { accountId: settings.payrollBankAccountId!, debit: 0, credit: netSalary, memo: "Pembayaran Gaji" },
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
