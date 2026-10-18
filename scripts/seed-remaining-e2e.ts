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
  // Tiga akun ini WAJIB ada supaya posting faktur benar-benar membukukan.
  // Sebelumnya seed hanya mengisi piutang, sementara `onSalesInvoicePosted` memerlukan
  // piutang DAN pendapatan — kalau kurang, hook-nya berhenti diam-diam dan faktur
  // berstatus `posted` tanpa satu pun entri buku. HPP & persediaan diperlukan supaya
  // jurnal HPP + pengurangan stok ikut terbentuk.
  const revenueAccount = await ensureAccount("E2E-4000", "E2E Sales Revenue", AccountType.REVENUE);
  const salesReturnAccount = await ensureAccount("E2E-4100", "E2E Sales Return", AccountType.REVENUE);
  const cogsAccount = await ensureAccount("E2E-5103", "E2E Cost of Goods Sold", AccountType.EXPENSE);
  const inventoryAccount = await ensureAccount("E2E-1104", "E2E Inventory", AccountType.ASSET);

  const settings = await prisma.systemSetting.findFirst();
  if (settings) {
    await prisma.systemSetting.update({
      where: { id: settings.id },
      data: {
        cashBankAccountId: cash.id,
        salesReceivableAccountId: receivable.id,
        salesRevenueAccountId: revenueAccount.id,
        salesReturnAccountId: salesReturnAccount.id,
        cogsAccountId: cogsAccount.id,
        inventoryAccountId: inventoryAccount.id,
        purchasePayableAccountId: payable.id,
        purchaseInventoryAccountId: inventoryAccount.id,
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
        salesRevenueAccountId: revenueAccount.id,
        salesReturnAccountId: salesReturnAccount.id,
        cogsAccountId: cogsAccount.id,
        inventoryAccountId: inventoryAccount.id,
        purchasePayableAccountId: payable.id,
        purchaseInventoryAccountId: inventoryAccount.id,
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
      // `draft` — sama seperti yang dihasilkan UI. Menuliskan "confirmed" di sini akan
      // MEMALSUKAN status yang tak bisa dicapai aplikasi (lihat docs/AUDIT-SCHEMA.md §5)
      // dan menyembunyikan gerbang buntu dari tes. Diukur: tak ada spec yang butuh itu —
      // tak ada spec yang membuat surat jalan, jadi status palsu ini tak memberi manfaat.
      status: "draft",
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
        create: salesOrder.items.map((soItem: { id: number; itemId: number | null; qty: number | { toString(): string } }) => ({
          salesOrderItemId: soItem.id,
          item: { connect: { id: soItem.itemId! } },
          qty: Number(soItem.qty),
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

  // ─── 2b. Sales Invoice KEDUA — sengaja TIDAK dibayar ─────────────────
  // Dipakai spec "tukar faktur". Form tukar faktur memang menolak faktur lunas
  // (menyaring sisa > 0), dan faktur bernilai tidak bisa dibuat lewat UI karena
  // form faktur penjualan belum punya baris item — jadi prasyaratnya disediakan di sini.
  const unpaidInvoice = await prisma.salesInvoice.create({
    data: {
      documentNo: await generateDocumentNumber("INV"),
      customerId: customer.id,
      salesOrderId: salesOrder.id,
      date: new Date("2026-05-29"),
      subtotal: 125000,
      grandTotal: 125000,
      totalAmount: 125000,
      status: "posted",
      paymentStatus: "unpaid",
      items: { create: [{ itemId: item.id, qty: 1, unitPrice: 125000, total: 125000 }] },
    },
  });
  console.log(`2b. Sales Invoice belum lunas: ${unpaidInvoice.documentNo} ✓ (prasyarat spec tukar faktur)`);

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
  const totalDebit = manualJournal.entries.reduce((sum: number, entry: { debit: unknown; credit: unknown }) => sum + Number(entry.debit), 0);
  const totalCredit = manualJournal.entries.reduce((sum: number, entry: { debit: unknown; credit: unknown }) => sum + Number(entry.credit), 0);
  assert(totalDebit === totalCredit, "Manual journal tidak balance");
  // DIBIARKAN `draft` (dulu dipaksa `POSTED` di sini). Mem-postnya langsung MEMALSUKAN
  // efek `postJournal` — aksi yang dulu tak tersambung ke UI (docs/AUDIT-SCHEMA.md §5).
  // `postJournal` kini tersambung dan spec `operational-crud` mem-post jurnal draft lewat
  // UI, jadi fabrikasi ini tak diperlukan. Diukur: un-posting tak memerahkan tes mana pun,
  // dan asersi `totalDebit > 0` di spec neraca-saldo tetap lolos (cakupan tidak hampa —
  // laporan tetap berisi posting otomatis dari hook).
  await prisma.journal.update({
    where: { id: manualJournal.id },
    data: { status: "DRAFT", totalDebit, totalCredit },
  });
  console.log(`4. Manual Journal: ${manualJournal.journalNumber} ✓ (balanced + draft)`);

  // ─── 4b. Jurnal manual DRAFT (menunggu posting) ──────────────────────
  // Dipakai spec posting jurnal. Di atas, seed mem-POSTED jurnal secara manual — meniru
  // efek `postJournal` alih-alih memanggilnya, karena aksi itu lama tak tersambung ke UI.
  const draftJournal = await prisma.journal.create({
    data: {
      journalNumber: await generateDocumentNumber("JRN"),
      transactionDate: new Date(),
      // Sengaja bertanggal HARI INI: spec "proses akhir bulan" mengunci periode sampai
      // akhir bulan lalu, sehingga jurnal bertanggal masa lalu akan ditolak `assertPeriodOpen`.
      description: "E2E jurnal manual menunggu posting",
      type: "MANUAL",
      status: "DRAFT",
      totalDebit: 250000,
      totalCredit: 250000,
      createdBy: userId,
      entries: {
        create: [
          { accountId: expenseAccount.id, debit: 250000, credit: 0, memo: "E2E draft" },
          { accountId: cash.id, debit: 0, credit: 250000, memo: "E2E draft" },
        ],
      },
    },
  });
  console.log(`4b. Jurnal manual DRAFT: ${draftJournal.journalNumber} ✓ (untuk spec posting)`);

  // ─── 5. Expense Approval ─────────────────────────────────────────────
  // Expense.category is a relation to ExpenseCategory (categoryId) now; passing
  // the old free-text "operational" raised a PrismaClientValidationError, which
  // made this seed - and therefore the whole CI e2e job - fail before a single
  // test ran.
  const expenseCategory = await prisma.expenseCategory.findFirst({
    where: { name: { in: ["operasional", "operational"] } },
    select: { id: true },
  });
  const expense = await prisma.expense.create({
    data: {
      documentNo: await generateDocumentNumber("EXP"),
      accountId: expenseAccount.id,
      paidFromAccountId: cash.id,
      amount: 75000,
      date: new Date("2026-05-28"),
      description: "E2E operational expense",
      categoryId: expenseCategory?.id ?? null,
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

  // 6. Released QC checklist. /produksi/qc/inspeksi/tambah renders the form only
  // when a released checklist exists, otherwise it shows a "belum ada checklist"
  // empty state. e2e/crud-surface.spec.ts auto-discovers every */tambah route and
  // asserts a visible form, so without this fixture that page fails in every
  // environment (no other seed creates a checklist). Upsert on the unique code
  // keeps re-runs safe.
  const checklist = await prisma.qcChecklist.upsert({
    where: { code: "E2E-QC-01" },
    update: { status: "released", isActive: true, releasedAt: new Date("2026-05-28") },
    create: {
      code: "E2E-QC-01",
      name: "E2E Checklist Inspeksi",
      checklistType: "incoming",
      status: "released",
      isActive: true,
      releasedAt: new Date("2026-05-28"),
      releasedBy: userId,
      createdBy: userId,
    },
  });
  // Items have no natural key, so create them only on first run (the upsert
  // above touches just the parent row).
  const existingItems = await prisma.qcChecklistItem.count({ where: { checklistId: checklist.id } });
  if (existingItems === 0) {
    await prisma.qcChecklistItem.createMany({
      data: [
        { checklistId: checklist.id, sortOrder: 1, itemName: "Pemeriksaan visual", method: "visual", isRequired: true },
        { checklistId: checklist.id, sortOrder: 2, itemName: "Ukuran dimensi", method: "measurement", spec: "±0.5mm", isRequired: true },
      ],
    });
  }
  const checklistItems = await prisma.qcChecklistItem.count({ where: { checklistId: checklist.id } });
  assert(checklistItems >= 1, "QC checklist items tidak tersimpan");
  console.log(`6. QC Checklist: ${checklist.code} ✓ (${checklistItems} item, released)`);

  // Asset — the crud-surface sweep walks /aset, and with an empty asset list
  // there is no row to open: the desktop run "passes" by matching a nav link
  // while the mobile run times out (the sidebar is collapsed). One row keeps
  // that route genuinely covered on both viewports.
  const asset = await prisma.asset.upsert({
    where: { code: "E2E-AST-01" },
    update: {},
    create: {
      code: "E2E-AST-01",
      name: "Aset E2E — Unit Uji",
      purchaseCost: 1000000,
      currentValue: 1000000,
      status: "active",
    },
  });
  console.log(`7. Asset: ${asset.code} ✓`);

  // Warehouse + rack — `inventory-rack-row-crud` skips itself when the selected
  // warehouse has no rack ("Tidak ada data rak ..."), which silently dropped
  // /inventaris/baris-rak from coverage: the test was skipped on chromium as well
  // as mobile. One rack keeps the desktop flow actually running.
  const e2eWarehouse = await prisma.warehouse.upsert({
    where: { code: "E2E-WH-01" },
    update: {},
    create: { code: "E2E-WH-01", name: "Gudang E2E" },
  });
  const e2eRack = await prisma.rack.upsert({
    where: { warehouseId_code: { warehouseId: e2eWarehouse.id, code: "E2E-RK-01" } },
    update: {},
    create: { warehouseId: e2eWarehouse.id, code: "E2E-RK-01", name: "Rak E2E" },
  });
  console.log(`8. Warehouse+Rack: ${e2eWarehouse.code} / ${e2eRack.code} ✓`);


  // ─── Kendaraan: merek/model/varian khusus E2E ────────────────────────
  // Tanpa ini, dropdown merek di form kendaraan hanya berisi merek buatan spec lain,
  // sehingga spec kendaraan memilih merek milik spec lain → merek itu jadi punya
  // referensi → aksi hapus merek menolak (memang benar) → spec merek gagal dan
  // menyisakan data yang meracuni run berikutnya. (Lihat e2e/vehicle-crud.spec.ts.)
  const e2eBrand = await prisma.vehicleBrand.upsert({
    where: { slug: "e2e-kendaraan" },
    update: {},
    create: { slug: "e2e-kendaraan", name: "E2E Kendaraan" },
  });
  const e2eModel = await prisma.vehicleModel.upsert({
    where: { slug: "e2e-kendaraan-model" },
    update: { vehicleBrandId: e2eBrand.id },
    create: { slug: "e2e-kendaraan-model", name: "E2E Model", vehicleBrandId: e2eBrand.id },
  });
  const e2eVariant = await prisma.vehicleVariant.findFirst({
    where: { vehicleModelId: e2eModel.id, name: "E2E Varian" },
  }) ?? await prisma.vehicleVariant.create({
    data: { vehicleModelId: e2eModel.id, name: "E2E Varian", drivetrain: "FWD", transmission: "Manual" },
  });
  // ─── 11. Produk BERSTOK + faktur DRAFT — prasyarat spec POSTING FAKTUR ───
  // Jalur uang (piutang/pendapatan/HPP + pengurangan stok) baru berjalan saat faktur
  // DIPOSTING, dan faktur bernilai tidak bisa dibuat lewat UI karena form faktur
  // penjualan belum punya baris item. Ditaruh di sini (bukan blok 2) karena butuh
  // gudang & rak dari blok 8.
  const stockedItem = await prisma.item.upsert({
    where: { sku: "E2E-POST-ITEM" },
    update: {
      qtyOnHand: 10,
      defaultWarehouseId: e2eWarehouse.id,
      defaultRackId: e2eRack.id,
    },
    create: {
      sku: "E2E-POST-ITEM",
      name: "E2E Produk Berstok",
      unitOfMeasure: "PCS",
      isProduct: true,
      isService: false,
      costingMethod: "average",
      qtyOnHand: 10,
      cost: 100000,
      price: 200000,
      isActive: true,
      defaultWarehouseId: e2eWarehouse.id,
      defaultRackId: e2eRack.id,
    },
  });

  // Penerimaan barang (IN) + LAPISAN FIFO. Ini bukan pelengkap: ketersediaan stok
  // dihitung dari `inventory_layers`, bukan dari `qtyOnHand`. Tanpa lapisan, posting
  // menolak dengan "stok tidak mencukupi ... tersedia 0" walaupun item menampilkan
  // stok 10 — dan itu benar, karena lapisan itulah yang mewakili stok yang benar-benar
  // pernah diterima.
  const receiptDocNo = "E2E-GR-POSTING";
  let receipt = await prisma.stockMove.findUnique({ where: { documentNo: receiptDocNo } });
  if (!receipt) {
    receipt = await prisma.stockMove.create({
      data: {
        documentNo: receiptDocNo,
        date: new Date("2026-06-01"),
        moveType: "IN",
        itemId: stockedItem.id,
        warehouseId: e2eWarehouse.id,
        qty: 10,
        cost: 100000,
        impact: "IN",
        status: "posted",
      },
    });
    await prisma.inventoryLayer.create({
      data: {
        itemId: stockedItem.id,
        stockMoveId: receipt.id,
        qtyIn: 10,
        qtyOut: 0,
        remaining: 10,
        unitCost: 100000,
        warehouseId: e2eWarehouse.id,
      },
    });
  } else {
    // Idempoten untuk basis data yang dipakai ulang: posting sebelumnya sudah
    // memakan sebagian lapisan, jadi dipulihkan ke 10 supaya spec bisa diulang.
    await prisma.inventoryLayer.updateMany({
      where: { stockMoveId: receipt.id },
      data: { qtyIn: 10, qtyOut: 0, remaining: 10 },
    });
    await prisma.item.update({ where: { id: stockedItem.id }, data: { qtyOnHand: 10 } });
  }

  // Idempoten: seed dijalankan berkali-kali tetap menyisakan SATU fixture draft.
  await prisma.salesInvoice.deleteMany({ where: { slug: "e2e-post-invoice-draft" } });
  const draftInvoice = await prisma.salesInvoice.create({
    data: {
      slug: "e2e-post-invoice-draft",
      documentNo: await generateDocumentNumber("INV"),
      customerId: customer.id,
      date: new Date("2026-06-01"),
      subtotal: 200000,
      grandTotal: 200000,
      totalAmount: 200000,
      status: "draft",
      paymentStatus: "unpaid",
      items: {
        create: [{ itemId: stockedItem.id, qty: 2, unitPrice: 100000, total: 200000, uom: "PCS" }],
      },
    },
  });
  console.log(
    `11. Faktur DRAFT berstok siap diposting: ${draftInvoice.documentNo} (slug e2e-post-invoice-draft; stok 10 + lapisan FIFO 10, posting harus menyisakan 8) ✓`,
  );

  console.log(`10. Kendaraan: ${e2eBrand.name} / ${e2eModel.name} / ${e2eVariant.name} ✓`);
  // ─── 12. RANTAI BELI P2-1: PO approved + item stok-able + vendor ───
  // Spec purchase-chain menekan tombol: terima → verifikasi GR,
  // buat + posting tagihan, catat + konfirmasi pembayaran. PO + GR-ID +
  // item dibentuk di sini supaya spec deterministik & idempoten.
  const buyVendor = await prisma.vendor.upsert({
    where: { code: "E2E-BUY-VENDOR" },
    update: { isActive: true },
    create: { code: "E2E-BUY-VENDOR", name: "E2E Pemasok Rantai", isActive: true },
  });
  const buyItem = await prisma.item.upsert({
    where: { sku: "E2E-BUY-ITEM" },
    update: { isActive: true, defaultWarehouseId: e2eWarehouse.id, defaultRackId: e2eRack.id },
    create: {
      sku: "E2E-BUY-ITEM", name: "E2E Bahan Rantai Beli", unitOfMeasure: "PCS",
      isProduct: false, isService: false, costingMethod: "average",
      qtyOnHand: 0, cost: 50000, price: 0, isActive: true,
      defaultWarehouseId: e2eWarehouse.id, defaultRackId: e2eRack.id,
    },
  });
  await prisma.purchaseOrder.deleteMany({ where: { documentNo: "E2E-PO-CHAIN" } });
  const chainPo = await prisma.purchaseOrder.create({
    data: {
      documentNo: "E2E-PO-CHAIN", slug: "e2e-po-chain", vendorId: buyVendor.id,
      date: new Date("2026-06-02"), status: "approved", subtotal: 500000,
      tax: 0, grandTotal: 500000, totalAmount: 500000, createdBy: userId,
      items: { create: [{ itemId: buyItem.id, qty: 10, unitPrice: 50000, total: 500000 }] },
    },
  });
  console.log(`12. Rantai beli: PO ${chainPo.documentNo} approved, 10x E2E-BUY-ITEM ✓`);

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
