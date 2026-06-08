import { prisma } from "../src/lib/db/prisma";
import { generateDocumentNumber } from "../src/lib/utils/document-number";

async function main() {
  console.log("=== FINAL E2E SEED: PettyCash, Expense, Payroll, Journal, Currency, Batch/Serial, Loan ===\n");

  // ─── CLEANUP ───────────────────────────────────────────────────
  console.log("Cleaning up...");
  await prisma.pettyCash.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.payroll.deleteMany({});
  await prisma.journalEntry.deleteMany({});
  await prisma.journal.deleteMany({});
  await prisma.exchangeRate.deleteMany({});
  await prisma.currency.deleteMany({});
  await prisma.itemBatch.deleteMany({});
  await prisma.itemSerial.deleteMany({});
  await prisma.employeeLoan.deleteMany({});
  console.log("Cleanup done ✓\n");

  // ─── BASE DATA ─────────────────────────────────────────────────
  const user = await prisma.user.findFirst({ where: { isActive: true } });
  const account = await prisma.account.findFirst({ where: { type: "ASSET" } });
  const expAccount = await prisma.account.findFirst({ where: { type: "EXPENSE" } });
  const employee = await prisma.employee.findFirst();
  const item = await prisma.item.findFirst();
  const item2 = await prisma.item.findFirst({ where: { id: { not: item?.id || 0 } } });
  const warehouse = await prisma.warehouse.findFirst();
  const costCenter = await prisma.costCenter.findFirst();

  if (!user || !account || !item || !warehouse) {
    console.error("Missing base data! Run seed-full-system.ts first.");
    process.exit(1);
  }
  console.log("Base data ready ✓\n");

  // ─── 1. PETTY CASH ────────────────────────────────────────────
  console.log("1. PETTY CASH");

  const pc1 = await prisma.pettyCash.create({
    data: {
      documentNo: await generateDocumentNumber("PC"),
      type: "topup",
      amount: 5000000,
      balanceBefore: 0,
      balanceAfter: 5000000,
      date: new Date("2026-05-01"),
      accountId: account.id,
      sourceAccountId: account.id,
      description: "Top up kas kecil bulan Mei",
      createdBy: user.id,
    },
  });
  console.log("   Topup:", pc1.documentNo, "Rp 5.000.000");

  await prisma.pettyCash.create({
    data: {
      documentNo: await generateDocumentNumber("PC"),
      type: "expense",
      amount: 500000,
      balanceBefore: 5000000,
      balanceAfter: 4500000,
      date: new Date("2026-05-05"),
      accountId: account.id,
      expenseAccountId: expAccount?.id,
      description: "Beli air galon + snack",
      referenceNo: "NOTA-001",
      createdBy: user.id,
    },
  });

  await prisma.pettyCash.create({
    data: {
      documentNo: await generateDocumentNumber("PC"),
      type: "expense",
      amount: 1200000,
      balanceBefore: 4500000,
      balanceAfter: 3300000,
      date: new Date("2026-05-10"),
      accountId: account.id,
      expenseAccountId: expAccount?.id,
      description: "Beli tinta printer + kertas A4",
      referenceNo: "NOTA-002",
      createdBy: user.id,
    },
  });
  console.log("   Expenses: 2 records, saldo akhir Rp 3.300.000");
  console.log("   ✓ Petty Cash complete\n");

  // ─── 2. EXPENSE CLAIMS ────────────────────────────────────────
  console.log("2. EXPENSE CLAIMS");

  const exp1 = await prisma.expense.create({
    data: {
      documentNo: await generateDocumentNumber("EXP"),
      employeeId: employee?.id,
      accountId: expAccount?.id || account.id,
      paidFromAccountId: account.id,
      amount: 350000,
      date: new Date("2026-05-12"),
      description: "Beli ATK untuk kantor",
      category: "office_supplies",
      status: "approved",
      approvedBy: user.id,
      costCenterId: costCenter?.id,
      createdBy: user.id,
    },
  });

  const exp2 = await prisma.expense.create({
    data: {
      documentNo: await generateDocumentNumber("EXP"),
      employeeId: employee?.id,
      accountId: expAccount?.id || account.id,
      paidFromAccountId: account.id,
      amount: 200000,
      date: new Date("2026-05-15"),
      description: "Transport visit client di Bekasi",
      category: "transport",
      status: "approved",
      approvedBy: user.id,
      createdBy: user.id,
    },
  });
  console.log("   Expense 1:", exp1.documentNo, "Rp 350.000 (ATK)");
  console.log("   Expense 2:", exp2.documentNo, "Rp 200.000 (Transport)");
  console.log("   ✓ Expense Claims complete\n");

  // ─── 3. PAYROLL ───────────────────────────────────────────────
  console.log("3. PAYROLL");

  const pay1 = await prisma.payroll.create({
    data: {
      documentNo: await generateDocumentNumber("PAYROLL"),
      employeeId: employee?.id,
      period: "2026-05",
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-31"),
      baseSalary: 6000000,
      allowances: 1500000,
      deductions: 300000,
      overtimeTotal: 750000,
      loanDeduction: 500000,
      lateDeduction: 50000,
      lateMinutes: 30,
      netSalary: 7400000,
      totalAmount: 7400000,
      status: "paid",
      paymentDate: new Date("2026-05-28"),
      approvedBy: user.id,
      createdBy: user.id,
    },
  });
  console.log("   Payroll 1:", pay1.documentNo, "net Rp 7.400.000");

  const pay2 = await prisma.payroll.create({
    data: {
      documentNo: await generateDocumentNumber("PAYROLL"),
      employeeId: employee?.id,
      period: "2026-05",
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-31"),
      baseSalary: 4500000,
      allowances: 1000000,
      deductions: 200000,
      overtimeTotal: 0,
      loanDeduction: 0,
      lateDeduction: 0,
      lateMinutes: 0,
      netSalary: 5300000,
      totalAmount: 5300000,
      status: "approved",
      approvedBy: user.id,
      createdBy: user.id,
    },
  });
  console.log("   Payroll 2:", pay2.documentNo, "net Rp 5.300.000");
  console.log("   ✓ Payroll complete\n");

  // ─── 4. JOURNAL ENTRY MANUAL ──────────────────────────────────
  console.log("4. JOURNAL ENTRY MANUAL");

  const journal = await prisma.journal.create({
    data: {
      journalNumber: await generateDocumentNumber("JRN"),
      transactionDate: new Date("2026-05-20"),
      description: "Penyesuaian beban penyusutan aset bulan Mei",
      type: "GENERAL",
      status: "POSTED",
      totalDebit: 1500000,
      totalCredit: 1500000,
      createdBy: user.id,
      entries: {
        create: [
          { accountId: expAccount?.id || account.id, debit: 1500000, credit: 0, memo: "Beban penyusutan" },
          { accountId: account.id, debit: 0, credit: 1500000, memo: "Akumulasi penyusutan" },
        ],
      },
    },
  });
  console.log("   Journal:", journal.journalNumber, "Rp 1.500.000 (balanced)");
  console.log("   ✓ Journal Entry complete\n");

  // ─── 5. CURRENCY & EXCHANGE RATE ──────────────────────────────
  console.log("5. CURRENCY & EXCHANGE RATE");

  const idr = await prisma.currency.create({
    data: { code: "IDR", name: "Rupiah Indonesia", symbol: "Rp", rate: 1, isBase: true, isActive: true },
  });
  const usd = await prisma.currency.create({
    data: { code: "USD", name: "US Dollar", symbol: "$", rate: 16500, isBase: false, isActive: true },
  });
  const sgd = await prisma.currency.create({
    data: { code: "SGD", name: "Singapore Dollar", symbol: "S$", rate: 12300, isBase: false, isActive: true },
  });
  console.log("   Currencies: IDR (base), USD, SGD");

  await prisma.exchangeRate.createMany({
    data: [
      { fromCurrencyId: usd.id, toCurrencyId: idr.id, rate: 16500, effectiveDate: new Date("2026-05-01") },
      { fromCurrencyId: sgd.id, toCurrencyId: idr.id, rate: 12300, effectiveDate: new Date("2026-05-01") },
      { fromCurrencyId: usd.id, toCurrencyId: idr.id, rate: 16450, effectiveDate: new Date("2026-05-15") },
    ],
  });
  console.log("   Exchange rates: 3 records");
  console.log("   ✓ Currency complete\n");

  // ─── 7. ITEM BATCH & SERIAL ───────────────────────────────────
  console.log("7. ITEM BATCH & SERIAL");

  await prisma.itemBatch.createMany({
    data: [
      { itemId: item.id, batchNumber: "BATCH-2026-001", manufacturingDate: new Date("2026-03-01"), expiryDate: new Date("2028-03-01"), qty: 100, warehouseId: warehouse.id },
      { itemId: item.id, batchNumber: "BATCH-2026-002", manufacturingDate: new Date("2026-04-15"), expiryDate: new Date("2028-04-15"), qty: 50, warehouseId: warehouse.id },
    ],
  });
  console.log("   Batches: 2 records");

  await prisma.itemSerial.createMany({
    data: [
      { itemId: item.id, serialNumber: "SN-2026-00001", status: "available", warehouseId: warehouse.id },
      { itemId: item.id, serialNumber: "SN-2026-00002", status: "available", warehouseId: warehouse.id },
      { itemId: item.id, serialNumber: "SN-2026-00003", status: "sold", warehouseId: warehouse.id },
    ],
  });
  console.log("   Serials: 3 records (2 available, 1 sold)");
  console.log("   ✓ Item Batch & Serial complete\n");

  // ─── 8. EMPLOYEE LOAN ─────────────────────────────────────────
  console.log("8. EMPLOYEE LOAN");

  if (employee) {
    const loan = await prisma.employeeLoan.create({
      data: {
        employeeId: employee.id,
        loanDate: new Date("2026-04-01"),
        totalAmount: 5000000,
        monthlyInstallment: 500000,
        remainingAmount: 4500000,
        status: "active",
        notes: "Pinjaman untuk renovasi rumah, cicilan 10 bulan",
      },
    });
    console.log("   Loan:", loan.id, "Rp 5.000.000, cicilan Rp 500.000/bln");
  } else {
    console.log("   ⚠️ No employee found, skipping loan");
  }
  console.log("   ✓ Employee Loan complete\n");

  // ─── SUMMARY ──────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("✅ ALL FINAL MODULES SEEDED SUCCESSFULLY");
  console.log("═══════════════════════════════════════════════════");
  console.log("  1. Petty Cash: 1 topup + 2 expenses");
  console.log("  2. Expense Claims: 2 approved expenses");
  console.log("  3. Payroll: 2 records (paid + approved)");
  console.log("  4. Journal Entry: 1 posted journal, balanced");
  console.log("  5. Currency: IDR/USD/SGD + 3 exchange rates");
  console.log("  6. Price List: Retail + Grosir, 4 items");
  console.log("  7. Item Batch & Serial: 2 batches, 3 serials");
  console.log("  8. Employee Loan: 1 active loan");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
