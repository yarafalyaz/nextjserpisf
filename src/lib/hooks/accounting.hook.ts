// @ts-nocheck
import { prisma, TxClient } from "@/lib/db/prisma";

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
  tx: TxClient,
  prefix: string,
  referenceId: number
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `${prefix}/${referenceId}/${timestamp}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. onSalesInvoicePosted
//    Dr. Receivable (total_amount)
//    Cr. Revenue (subtotal) + Cr. Tax (tax_amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onSalesInvoicePosted(
  invoiceId: number,
  userId?: number
): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.salesReceivableAccountId || !settings.salesRevenueAccountId) return;

  const invoice = await prisma.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });

  // Idempotency: check if journal already exists
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "SalesInvoice", referenceId: invoiceId },
  });
  if (existing) return;

  await prisma.$transaction(async (tx) => {
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
    const subtotal = Number(invoice.totalAmount) - taxAmount;

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
        credit: subtotal,
        memo: "Pendapatan Penjualan",
      },
    });

    // Cr. PPN Keluaran (if any)
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
    include: { invoice: true },
  });

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "SalesPayment", referenceId: paymentId },
  });
  if (existing) return;

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
        description: `Pembayaran Invoice ${payment.invoice?.documentNo ?? ""}`,
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

  await prisma.$transaction(async (tx) => {
    const journalNumber = await generateJournalNumber(tx, "PO-RCV", orderId);

    const taxAmount = Number(order.taxAmount ?? 0);
    const subtotal = Number(order.totalAmount) - taxAmount;

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
        debit: subtotal,
        credit: 0,
        memo: "Persediaan Masuk",
      },
    });

    // Dr. PPN Masukan (if any)
    if (taxAmount > 0 && settings.purchaseTaxAccountId) {
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.purchaseTaxAccountId,
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

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "StockAdjustment", referenceId: adjustmentId },
  });
  if (existing) return;

  // Calculate total adjustment value
  let totalPositive = 0;
  let totalNegative = 0;

  for (const item of adjustment.items) {
    const diff = Number(item.newQty) - Number(item.currentQty);
    const value = Math.abs(diff) * Number(item.unitCost ?? 0);
    if (diff > 0) totalPositive += value;
    else if (diff < 0) totalNegative += value;
  }

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
          referenceType: "StockAdjustment",
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
    (sum, item) => sum + Number(item.qty) * Number(item.unitCost ?? 0),
    0
  );

  if (totalCost <= 0) return;

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

  await prisma.$transaction(async (tx) => {
    const journalNumber = await generateJournalNumber(tx, "EXP", expenseId);

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: expense.expenseDate ?? new Date(),
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
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          accountId: settings.pettyCashAccountId!,
          debit: pettyCash.amount,
          credit: 0,
          memo: "Pengisian Kas Kecil",
        },
      });

      const sourceAccountId =
        pettyCash.sourceAccountId ?? settings.cashBankAccountId;
      if (sourceAccountId) {
        await tx.journalEntry.create({
          data: {
            journalId: journal.id,
            accountId: sourceAccountId,
            debit: 0,
            credit: pettyCash.amount,
            memo: "Sumber Dana Kas Kecil",
          },
        });
      }
    } else {
      // OUT: Dr. Expense Account, Cr. PettyCash
      const expenseAccountId =
        pettyCash.expenseAccountId ?? settings.generalExpenseAccountId;

      if (expenseAccountId) {
        await tx.journalEntry.create({
          data: {
            journalId: journal.id,
            accountId: expenseAccountId,
            debit: pettyCash.amount,
            credit: 0,
            memo: `Pengeluaran: ${pettyCash.description ?? ""}`,
          },
        });
      }

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
  if (!settings.salesReturnAccountId || !settings.salesReceivableAccountId) return;

  const salesReturn = await prisma.salesReturn.findUniqueOrThrow({
    where: { id: returnId },
  });

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "SalesReturn", referenceId: returnId },
  });
  if (existing) return;

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
        totalDebit: salesReturn.totalAmount,
        totalCredit: salesReturn.totalAmount,
        createdBy: userId ?? null,
      },
    });

    // Dr. Retur Penjualan
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.salesReturnAccountId!,
        debit: salesReturn.totalAmount,
        credit: 0,
        memo: "Retur Penjualan",
      },
    });

    // Cr. Piutang Usaha
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.salesReceivableAccountId!,
        debit: 0,
        credit: salesReturn.totalAmount,
        memo: "Pengurangan Piutang (Retur)",
      },
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
  });

  // Idempotency check
  const existing = await prisma.journal.findFirst({
    where: { referenceType: "PurchaseReturn", referenceId: returnId },
  });
  if (existing) return;

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
        totalDebit: purchaseReturn.totalAmount,
        totalCredit: purchaseReturn.totalAmount,
        createdBy: userId ?? null,
      },
    });

    // Dr. Hutang Usaha
    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId: settings.purchasePayableAccountId!,
        debit: purchaseReturn.totalAmount,
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
        credit: purchaseReturn.totalAmount,
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
    (sum, item) => sum + Number(item.qty) * Number(item.unitCost ?? 0),
    0
  );

  if (totalCost <= 0) return;

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
  if (!settings.salesReceivableAccountId) return;

  const dp = await prisma.downPayment.findUniqueOrThrow({
    where: { id: dpId },
  });

  const existing = await prisma.journal.findFirst({
    where: { referenceType: "DownPayment", referenceId: dpId },
  });
  if (existing) return;

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
            { accountId: settings.salesReceivableAccountId!, debit: dp.amount, credit: 0, memo: "Bank/Cash received" },
            { accountId: settings.salesRevenueAccountId || settings.salesReceivableAccountId!, debit: 0, credit: dp.amount, memo: "Uang Muka Penjualan" },
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
            { accountId: settings.purchaseExpenseAccountId || settings.purchasePayableAccountId!, debit: bill.grandTotal, credit: 0, memo: "Purchase expense" },
            { accountId: settings.purchasePayableAccountId!, debit: 0, credit: bill.grandTotal, memo: "Accounts Payable" },
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
  if (!settings.purchasePayableAccountId) return;

  const payment = await prisma.vendorPayment.findUniqueOrThrow({
    where: { id: paymentId },
  });

  const existing = await prisma.journal.findFirst({
    where: { referenceType: "VendorPayment", referenceId: paymentId },
  });
  if (existing) return;

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
            { accountId: settings.purchasePayableAccountId!, debit: payment.amount, credit: 0, memo: "Accounts Payable" },
            { accountId: settings.salesReceivableAccountId || settings.purchasePayableAccountId!, debit: 0, credit: payment.amount, memo: "Bank/Cash paid" },
          ],
        },
      },
    });
  });
}
