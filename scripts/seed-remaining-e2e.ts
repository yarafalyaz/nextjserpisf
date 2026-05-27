import { AccountType } from "@prisma/client";
import { onExpenseApproved, onSalesPaymentCreated as createSalesPaymentJournal, onVendorBillPosted, onVendorPaymentCreated } from "../src/lib/hooks/accounting.hook";
import { onSalesPaymentCreated as recalculateSalesPayment } from "../src/lib/hooks/sales-payment.hook";
import { prisma } from "../src/lib/db/prisma";
import { generateDocumentNumber } from "../src/lib/utils/document-number";

async function ensureAccount(code: string, name: string, type: AccountType) {
  return prisma.account.upsert({
    where: { code },
    update: { name, type, isActive: true },
    create: { code, name, type, normalBalance: type === AccountType.LIABILITY || type === AccountType.REVENUE ? "credit" : "debit" },
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("=== E2E: REMAINING CORE FLOWS ===\n");

  const cash = await ensureAccount("E2E-1000", "E2E Cash/Bank", AccountType.ASSET);
  const receivable = await ensureAccount("E2E-1100", "E2E Accounts Receivable", AccountType.ASSET);
  const payable = await ensureAccount("E2E-2100", "E2E Accounts Payable", AccountType.LIABILITY);
  const expenseAccount = await ensureAccount("E2E-5100", "E2E General Expense", AccountType.EXPENSE);

  const settings = await prisma.systemSetting.findFirst();
  if (settings) {
    await prisma.systemSetting.update({
      where: { id: settings.id },
      data: {
        cashBankAccountId: cash.id,
        salesReceivableAccountId: receivable.id,
        purchasePayableAccountId: payable.id,
        purchaseExpenseAccountId: expenseAccount.id,
        generalExpenseAccountId: expenseAccount.id,
      },
    });
  } else {
    await prisma.systemSetting.create({
      data: {
        companyName: "Yara ERP",
        cashBankAccountId: cash.id,
        salesReceivableAccountId: receivable.id,
        purchasePayableAccountId: payable.id,
        purchaseExpenseAccountId: expenseAccount.id,
        generalExpenseAccountId: expenseAccount.id,
      },
    });
  }

  const customer = await prisma.customer.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "E2E Customer", phone: "081200000001" },
  });
  const vendor = await prisma.vendor.upsert({
    where: { code: "E2E-VEND" },
    update: { name: "E2E Vendor" },
    create: { code: "E2E-VEND", name: "E2E Vendor", phone: "081200000002" },
  });
  const item = await prisma.item.upsert({
    where: { sku: "E2E-ITEM-CORE" },
    update: { name: "E2E Core Item", price: 150000, cost: 90000 },
    create: { sku: "E2E-ITEM-CORE", name: "E2E Core Item", price: 150000, cost: 90000, qtyOnHand: 20 },
  });
  const user = await prisma.user.findFirst({ select: { id: true } });
  const userId = user?.id;

  console.log("Base data + accounting settings ready ✓");

  // ─── 1. Delivery Order ───────────────────────────────────────────────
  const salesOrder = await prisma.salesOrder.create({
    data: {
      documentNo: await generateDocumentNumber("SO"),
      customerId: customer.id,
      date: new Date("2026-05-28"),
      subtotal: 300000,
      grandTotal: 300000,
      totalAmount: 300000,
      status: "confirmed",
      items: { create: [{ itemId: item.id, qty: 2, unitPrice: 150000, total: 300000 }] },
    },
    include: { items: true },
  });

  const deliveryOrder = await prisma.deliveryOrder.create({
    data: {
      documentNo: await generateDocumentNumber("DO"),
      salesOrderId: salesOrder.id,
      customerId: customer.id,
      date: new Date("2026-05-28"),
      deliveryDate: new Date("2026-05-29"),
      shippingAddress: "Jl. E2E No. 1",
      shippingProvince: "DKI Jakarta",
      shippingCity: "Jakarta Selatan",
      shippingDistrict: "Kebayoran Baru",
      shippingVillage: "Senayan",
      shippingPostalCode: "12190",
      shippingPhone: "081299988877",
      vehicleNumber: "B 1234 E2E",
      notes: "E2E delivery order",
      status: "draft",
      items: {
        create: salesOrder.items.map((soItem) => ({
          salesOrderItemId: soItem.id,
          itemId: soItem.itemId!,
          qty: soItem.qty,
          unit: "PCS",
        })),
      },
    },
    include: { items: true },
  });
  assert(deliveryOrder.customerId === customer.id, "Delivery Order customerId tidak tersimpan");
  assert(deliveryOrder.shippingAddress === "Jl. E2E No. 1", "Delivery Order alamat pengiriman tidak tersimpan");
  assert(deliveryOrder.items.length === salesOrder.items.length, "Delivery Order items tidak sesuai Sales Order");
  console.log(`1. Delivery Order: ${deliveryOrder.documentNo} ✓ (${deliveryOrder.items.length} item, alamat tersimpan)`);

  // ─── 2. Sales Invoice + Payment ──────────────────────────────────────
  const invoice = await prisma.salesInvoice.create({
    data: {
      documentNo: await generateDocumentNumber("INV"),
      customerId: customer.id,
      salesOrderId: salesOrder.id,
      date: new Date("2026-05-28"),
      subtotal: 300000,
      grandTotal: 300000,
      totalAmount: 300000,
      status: "posted",
      paymentStatus: "unpaid",
      items: { create: [{ itemId: item.id, qty: 2, unitPrice: 150000, total: 300000 }] },
    },
  });
  const salesPayment = await prisma.salesPayment.create({
    data: {
      documentNo: await generateDocumentNumber("PAY"),
      customerId: customer.id,
      salesInvoiceId: invoice.id,
      amount: 300000,
      paymentDate: new Date("2026-05-28"),
      paymentMethod: "transfer",
      accountId: cash.id,
      notes: "E2E full payment",
    },
  });
  await recalculateSalesPayment(salesPayment.id);
  await createSalesPaymentJournal(salesPayment.id, userId);
  const paidInvoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
  const salesPaymentJournal = await prisma.journal.findFirst({
    where: { referenceType: "SalesPayment", referenceId: salesPayment.id },
    include: { entries: true },
  });
  assert(Number(paidInvoice.paidAmount) === 300000, "Sales Invoice paidAmount tidak terupdate");
  assert(paidInvoice.paymentStatus === "paid", "Sales Invoice paymentStatus bukan paid");
  assert(salesPaymentJournal?.entries.length === 2, "Sales Payment journal tidak lengkap");
  console.log(`2. Sales Payment: ${salesPayment.documentNo} ✓ (invoice paid + journal 2 entries)`);

  // ─── 3. Vendor Bill + Payment ────────────────────────────────────────
  const bill = await prisma.vendorBill.create({
    data: {
      documentNo: await generateDocumentNumber("BILL"),
      vendorId: vendor.id,
      date: new Date("2026-05-28"),
      subtotal: 180000,
      grandTotal: 180000,
      balanceDue: 180000,
      status: "draft",
      items: { create: [{ itemId: item.id, description: "E2E vendor bill item", qty: 2, unitPrice: 90000, subtotal: 180000, total: 180000 }] },
    },
  });
  await onVendorBillPosted(bill.id, userId);
  const billJournal = await prisma.journal.findFirst({
    where: { referenceType: "VendorBill", referenceId: bill.id },
    include: { entries: true },
  });
  assert(billJournal?.entries.length === 2, "Vendor Bill journal tidak lengkap");

  const vendorPayment = await prisma.vendorPayment.create({
    data: {
      documentNo: await generateDocumentNumber("VPAY"),
      vendorId: vendor.id,
      amount: 180000,
      paymentDate: new Date("2026-05-28"),
      paymentMethod: "transfer",
      accountId: cash.id,
      notes: "E2E vendor payment",
    },
  });
  await onVendorPaymentCreated(vendorPayment.id, userId);
  const vendorPaymentJournal = await prisma.journal.findFirst({
    where: { referenceType: "VendorPayment", referenceId: vendorPayment.id },
    include: { entries: true },
  });
  assert(vendorPaymentJournal?.entries.length === 2, "Vendor Payment journal tidak lengkap");
  console.log(`3. Vendor Bill + Payment: ${bill.documentNo} / ${vendorPayment.documentNo} ✓ (journals created)`);

  // ─── 4. Manual Journal ───────────────────────────────────────────────
  const manualJournal = await prisma.journal.create({
    data: {
      journalNumber: await generateDocumentNumber("JRN"),
      transactionDate: new Date("2026-05-28"),
      description: "E2E balanced manual journal",
      type: "GENERAL",
      status: "DRAFT",
      totalDebit: 0,
      totalCredit: 0,
      entries: {
        create: [
          { accountId: expenseAccount.id, debit: 50000, credit: 0, memo: "Manual expense" },
          { accountId: cash.id, debit: 0, credit: 50000, memo: "Manual cash" },
        ],
      },
    },
    include: { entries: true },
  });
  const totalDebit = manualJournal.entries.reduce((sum, entry) => sum + Number(entry.debit), 0);
  const totalCredit = manualJournal.entries.reduce((sum, entry) => sum + Number(entry.credit), 0);
  assert(totalDebit === totalCredit, "Manual journal tidak balance");
  await prisma.journal.update({
    where: { id: manualJournal.id },
    data: { status: "POSTED", totalDebit, totalCredit },
  });
  console.log(`4. Manual Journal: ${manualJournal.journalNumber} ✓ (balanced + posted)`);

  // ─── 5. Expense Approval ─────────────────────────────────────────────
  const expense = await prisma.expense.create({
    data: {
      documentNo: await generateDocumentNumber("EXP"),
      accountId: expenseAccount.id,
      paidFromAccountId: cash.id,
      amount: 75000,
      date: new Date("2026-05-28"),
      description: "E2E operational expense",
      category: "operational",
      status: "approved",
      approvedBy: userId,
    },
  });
  await onExpenseApproved(expense.id, userId);
  const expenseJournal = await prisma.journal.findFirst({
    where: { referenceType: "Expense", referenceId: expense.id },
    include: { entries: true },
  });
  assert(expenseJournal?.entries.length === 2, "Expense journal tidak lengkap");
  console.log(`5. Expense: ${expense.documentNo} ✓ (approval journal created)`);

  console.log("\n=== REMAINING CORE FLOWS E2E COMPLETE ===");
}

main()
  .catch((error) => {
    console.error("ERROR:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
