import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * TASK-011 BUG-04 (diperbarui F-2026-10-28-155-S via vonis 123-V Putusan 0.2):
 * retur selesai menyelaraskan subledger dengan GL dalam transaksi yang sama.
 * Jurnal retur jual mengkredit Piutang (pengurang kanonis = returnCredit
 * jurnal itu, dibaca loader) — grandTotalAsal faktur BEKU, hook hanya hitung
 * ulang status dari outstanding valid + tulis CustomerCredit bila lebih.
 * Jurnal retur beli mendebit Hutang — pengurang kanonis via balanceDue
 * (grandTotal tagihan ikut beku).
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  settings: {
    salesReturnAccountId: 420 as number | null,
    salesReceivableAccountId: 110 as number | null,
    salesTaxAccountId: 230 as number | null,
    inventoryAccountId: 130 as number | null,
    purchasePayableAccountId: 210 as number | null,
    purchaseReturnAccountId: 220 as number | null,
    customerDownPaymentAccountId: 240 as number | null,
  },
  priorReturnsFindMany: vi.fn(),
  priorJournalsFindMany: vi.fn(),
  salesReturnFind: vi.fn(),
  purchaseReturnFind: vi.fn(),
  invoiceFindUnique: vi.fn(),
  itemFindMany: vi.fn(),
  journalFindFirst: vi.fn(),
  journalCreate: vi.fn(),
  stockMoveFindMany: vi.fn(),
  invoiceUpdate: vi.fn(),
  creditFindFirst: vi.fn(),
  creditCreate: vi.fn(),
  billFindFirst: vi.fn(),
  billFindMany: vi.fn(),
  billUpdate: vi.fn(),
  vendorCreditCreate: vi.fn(),
  poFindUnique: vi.fn(),
  generateDocumentNumber: vi.fn(),
  entryCreateMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: any) => mocks.transaction(fn),
    systemSetting: { findFirst: vi.fn().mockResolvedValue(mocks.settings) },
    salesReturn: { findUniqueOrThrow: (...a: unknown[]) => mocks.salesReturnFind(...a) },
    purchaseReturn: { findUniqueOrThrow: (...a: unknown[]) => mocks.purchaseReturnFind(...a) },
    salesInvoice: { findUnique: (...a: unknown[]) => mocks.invoiceFindUnique(...a) },
    item: { findMany: (...a: unknown[]) => mocks.itemFindMany(...a) },
    journal: { findFirst: (...a: unknown[]) => mocks.journalFindFirst(...a) },
    stockMove: { findMany: (...a: unknown[]) => mocks.stockMoveFindMany(...a) },
  },
}))

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocumentNumber(...a),
  generateDocumentNumberBatch: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { next: () => Promise.resolve(42) },
}))

import { onSalesReturnCompleted, onPurchaseReturnProcessed } from "../accounting.hook"

function salesTx(invoice: Record<string, unknown>) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    systemSetting: { findFirst: vi.fn().mockResolvedValue(mocks.settings) },
    salesReturnItem: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    salesInvoice: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(invoice),
      update: mocks.invoiceUpdate,
    },
    taxInvoice: { findFirst: vi.fn().mockResolvedValue(null) },
    salesReturn: { findMany: mocks.priorReturnsFindMany },
    journal: {
      findFirst: mocks.journalFindFirst,
      findMany: mocks.priorJournalsFindMany,
      create: mocks.journalCreate,
    },
    journalEntry: { createMany: mocks.entryCreateMany },
    customerCredit: { findFirst: mocks.creditFindFirst, create: mocks.creditCreate },
  }
}

function purchaseTx(_bill: Record<string, unknown> | null) {
  return {
    systemSetting: { findFirst: vi.fn().mockResolvedValue(mocks.settings) },
    stockMove: { findMany: mocks.stockMoveFindMany },
    journal: { findFirst: mocks.journalFindFirst, create: mocks.journalCreate },
    journalEntry: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    vendorBill: { findFirst: mocks.billFindFirst, findMany: mocks.billFindMany, update: mocks.billUpdate },
    vendorCredit: { create: mocks.vendorCreditCreate },
    purchaseOrder: { findUnique: mocks.poFindUnique },
  }
}

function purchaseTxWithLock() {
  const queryRaw = vi.fn().mockResolvedValue([])
  return {
    $queryRaw: queryRaw,
    systemSetting: { findFirst: vi.fn().mockResolvedValue(mocks.settings) },
    stockMove: { findMany: mocks.stockMoveFindMany },
    journal: { findFirst: mocks.journalFindFirst, create: mocks.journalCreate },
    journalEntry: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    vendorBill: { findFirst: mocks.billFindFirst, findMany: mocks.billFindMany, update: mocks.billUpdate },
    __queryRaw: queryRaw,
    __billFindMany: mocks.billFindMany,
  }
}

describe("TASK-011 BUG-04 — subledger retur selaras GL", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.journalCreate.mockResolvedValue({ id: 9 })
    mocks.invoiceUpdate.mockResolvedValue({})
    mocks.creditFindFirst.mockResolvedValue(null)
    mocks.creditCreate.mockResolvedValue({ id: 31 })
    mocks.billFindMany.mockResolvedValue([])
    mocks.billUpdate.mockResolvedValue({})
    mocks.vendorCreditCreate.mockResolvedValue({ id: 41 })
    mocks.poFindUnique.mockResolvedValue({ vendorId: 9 })
    mocks.generateDocumentNumber.mockResolvedValue("CC-900")
    mocks.itemFindMany.mockResolvedValue([{ id: 60, isScrapSaleItem: false }])
    mocks.stockMoveFindMany.mockResolvedValue([])
    mocks.entryCreateMany.mockResolvedValue({ count: 5 })
    mocks.priorReturnsFindMany.mockResolvedValue([])
    mocks.priorJournalsFindMany.mockResolvedValue([])
  })

  it("retur jual faktur ber-PPN: jurnal memuat Dr PPN Keluaran, Cr Piutang = DPP+PPN", async () => {
    mocks.salesReturnFind.mockResolvedValue({
      id: 8,
      documentNo: "SR-8",
      salesInvoiceId: 58,
      date: new Date("2026-10-02T00:00:00Z"),
      items: [{ id: 903, itemId: 60, qty: 2, price: 100, cost: 60 }],
    })
    mocks.invoiceFindUnique.mockResolvedValue({ id: 58, items: [{ itemId: 60, qty: 2 }] })
    // DPP faktur 1000, PPN 11% = 110 → tarif snapshot 11%. Retur DPP 200 → PPN 22.
    const invoice = {
      subtotal: 1000, discount: 0, taxAmount: 110,
      grandTotal: 1110, paidAmount: 0, customerId: 99, documentNo: "INV-8",
    }
    mocks.transaction.mockImplementation(async (fn: any) => fn(salesTx(invoice)))

    await onSalesReturnCompleted(8, 7)

    const rows = mocks.entryCreateMany.mock.calls[0][0].data as any[]
    const leg = (accountId: number, side: "debit" | "credit") =>
      rows.filter((r) => r.accountId === accountId).reduce((s, r) => s + Number(r[side]), 0)
    expect(leg(420, "debit")).toBe(200)
    expect(leg(230, "debit")).toBe(22)
    expect(leg(110, "credit")).toBe(222)
    const debit = rows.reduce((s, r) => s + Number(r.debit), 0)
    const credit = rows.reduce((s, r) => s + Number(r.credit), 0)
    expect(debit).toBe(credit)
  })

  it("retur jual atas faktur partial: grandTotalAsal BEKU, status dari outstanding valid, tanpa kredit", async () => {
    mocks.salesReturnFind.mockResolvedValue({
      id: 1,
      documentNo: "SR-1",
      salesInvoiceId: 55,
      date: new Date("2026-10-02T00:00:00Z"),
      items: [{ id: 900, itemId: 60, qty: 2, price: 100, cost: 60 }],
    })
    mocks.invoiceFindUnique.mockResolvedValue({ id: 55, items: [{ itemId: 60, qty: 2 }] })
    const invoice = {
      subtotal: 1000, discount: 0, taxAmount: 0,
      grandTotal: 1000, paidAmount: 600, customerId: 99, documentNo: "INV-1",
    }
    mocks.transaction.mockImplementation(async (fn: any) => fn(salesTx(invoice)))

    await onSalesReturnCompleted(1, 7)

    // Retur 200 dari sisa valid (1000 − 600 − 200 = 200) → partial;
    // grandTotalAsal BEKU 1000 (123-V Putusan 0.2), loader kurangi returnCredit.
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 55 },
        data: expect.objectContaining({ paidAmount: 600, status: "partial", paymentStatus: "partial" }),
      }),
    )
    // grandTotal/totalAmount TIDAK ditulis ulang oleh hook retur.
    const written = mocks.invoiceUpdate.mock.calls[0][0].data as Record<string, unknown>
    expect(written).not.toHaveProperty("grandTotal")
    expect(written).not.toHaveProperty("totalAmount")
    expect(mocks.creditCreate).not.toHaveBeenCalled()
  })

  it("retur jual atas faktur lunas: kelebihan retur menjadi CustomerCredit SalesReturn", async () => {
    mocks.salesReturnFind.mockResolvedValue({
      id: 2,
      documentNo: "SR-2",
      salesInvoiceId: 56,
      date: new Date("2026-10-02T00:00:00Z"),
      items: [{ id: 901, itemId: 60, qty: 2, price: 100, cost: 60 }],
    })
    mocks.invoiceFindUnique.mockResolvedValue({ id: 56, items: [{ itemId: 60, qty: 2 }] })
    const invoice = {
      subtotal: 1000, discount: 0, taxAmount: 0,
      grandTotal: 1000, paidAmount: 1000, customerId: 99, documentNo: "INV-2",
    }
    mocks.transaction.mockImplementation(async (fn: any) => fn(salesTx(invoice)))

    await onSalesReturnCompleted(2, 7)

    expect(mocks.creditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 99, sourceType: "SalesReturn", sourceId: 2, receivedAmount: 200,
        }),
      }),
    )
  })

  it("retur jual atas faktur lunas penuh oleh kas: status tetap paid (bukan partial), kelebihan menjadi kredit", async () => {
    mocks.salesReturnFind.mockResolvedValue({
      id: 4,
      documentNo: "SR-4",
      salesInvoiceId: 57,
      date: new Date("2026-10-02T00:00:00Z"),
      items: [{ id: 902, itemId: 60, qty: 1, price: 100, cost: 60 }],
    })
    mocks.invoiceFindUnique.mockResolvedValue({ id: 57, items: [{ itemId: 60, qty: 2 }] })
    const invoice = {
      subtotal: 1000, discount: 0, taxAmount: 0,
      grandTotal: 1000, paidAmount: 1000, customerId: 99, documentNo: "INV-4",
    }
    mocks.transaction.mockImplementation(async (fn: any) => fn(salesTx(invoice)))

    await onSalesReturnCompleted(4, 7)

    // Regression: outstanding sesudah retur = 1000 − 1000 − 100 = −100
    // (lunas + kelebihan). isSettled harus menerima TOTAL terbayar valid
    // (kas 1000 + kredit retur 100), bukan sisa outstanding sebagai
    // grandTotal — sisa −100/0 membuat isSettled selalu false → partial.
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 57 },
        data: expect.objectContaining({ paidAmount: 1000, status: "paid", paymentStatus: "paid" }),
      }),
    )
    expect(mocks.creditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 99, sourceType: "SalesReturn", sourceId: 4, receivedAmount: 100,
        }),
      }),
    )
  })

  it("regresi putaran 16: retur kedua kumulatif — Cr Piutang dibatasi sisa, kelebihan jadi CustomerCredit, status paid", async () => {
    mocks.salesReturnFind.mockResolvedValue({
      id: 5,
      documentNo: "SR-5",
      salesInvoiceId: 59,
      date: new Date("2026-10-02T00:00:00Z"),
      items: [{ id: 904, itemId: 60, qty: 3, price: 100, cost: 60 }],
    })
    mocks.invoiceFindUnique.mockResolvedValue({ id: 59, items: [{ itemId: 60, qty: 3 }] })
    // Faktur 1000, kas 600, retur pertama sudah Cr Piutang 300 (jurnal POSTED).
    // Sisa valid = 100. Retur kedua 300 → Cr Piutang 100 saja, 200 kelebihan.
    const invoice = {
      subtotal: 1000, discount: 0, taxAmount: 0,
      grandTotal: 1000, paidAmount: 600, customerId: 99, documentNo: "INV-5",
    }
    mocks.priorReturnsFindMany.mockResolvedValue([{ id: 77 }])
    mocks.priorJournalsFindMany.mockResolvedValue([{ entries: [{ credit: 300 }] }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(salesTx(invoice)))

    await onSalesReturnCompleted(5, 7)

    const rows = mocks.entryCreateMany.mock.calls[0][0].data as any[]
    const leg = (accountId: number, side: "debit" | "credit") =>
      rows.filter((r) => r.accountId === accountId).reduce((s, r) => s + Number(r[side]), 0)
    expect(leg(110, "credit")).toBe(100)
    expect(leg(240, "credit")).toBe(200)
    const debit = rows.reduce((s, r) => s + Number(r.debit), 0)
    const credit = rows.reduce((s, r) => s + Number(r.credit), 0)
    expect(debit).toBe(credit)
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 59 },
        data: expect.objectContaining({ paidAmount: 600, status: "paid", paymentStatus: "paid" }),
      }),
    )
    expect(mocks.creditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 99, sourceType: "SalesReturn", sourceId: 5, receivedAmount: 200,
        }),
      }),
    )
  })

  it("retur beli: hanya balanceDue tagihan turun sebesar retur (grandTotal beku, sisa neto)", async () => {
    mocks.purchaseReturnFind.mockResolvedValue({
      id: 3,
      documentNo: "PR-1",
      purchaseOrderId: 7,
      date: new Date("2026-10-02T00:00:00Z"),
      items: [{ qty: 2, cost: 100 }],
    })
    mocks.billFindMany.mockResolvedValue([
      { id: 5, goodsReceiptId: null, paidAmount: 200, balanceDue: 800, items: [] },
    ])
    mocks.transaction.mockImplementation(async (fn: any) => fn(purchaseTx(null)))

    await onPurchaseReturnProcessed(3, 7)

    // Retur 200 → balanceDue 800−200=600; grandTotal tagihan BEKU 1000.
    expect(mocks.billUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ balanceDue: 600, status: "partial" }),
      }),
    )
    const writtenBill = mocks.billUpdate.mock.calls[0][0].data as Record<string, unknown>
    expect(writtenBill).not.toHaveProperty("grandTotal")
  })

  it("retur beli: lock baris vendor_bills FOR UPDATE sebelum relief dibaca (race balanceDue)", async () => {
    mocks.purchaseReturnFind.mockResolvedValue({
      id: 3,
      documentNo: "PR-1",
      purchaseOrderId: 7,
      date: new Date("2026-10-02T00:00:00Z"),
      items: [{ qty: 2, cost: 100 }],
    })
    mocks.billFindMany.mockResolvedValue([
      { id: 5, goodsReceiptId: null, paidAmount: 200, balanceDue: 800, items: [] },
    ])
    const tx = purchaseTxWithLock()
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onPurchaseReturnProcessed(3, 7)

    expect(tx.__billFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ purchaseOrderId: 7, balanceDue: { gt: 0 } }),
      }),
    )
    expect(tx.__queryRaw).toHaveBeenCalled()
    const sql = tx.__queryRaw.mock.calls.map((c: unknown[]) => Array.from(c[0] as TemplateStringsArray).join("?")).join(" ")
    expect(sql).toContain("vendor_bills")
    expect(sql).toContain("FOR UPDATE")
    // findMany pertama = daftar id untuk lock; query relief adalah yang kedua.
    expect(tx.__queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.billFindMany.mock.invocationCallOrder[1])
    expect(mocks.billUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 }, data: expect.objectContaining({ balanceDue: 600 }) }),
    )
  })

  it("R8-JB-03: retur multi-bill melegakan bill terbuka tertua, bukan bill lunas terbaru", async () => {
    mocks.purchaseReturnFind.mockResolvedValue({
      id: 4,
      documentNo: "PR-2",
      purchaseOrderId: 7,
      date: new Date("2026-10-03T00:00:00Z"),
      items: [{ qty: 3, cost: 100 }],
    })
    // findMany hanya mengembalikan bill TERBUKA (where balanceDue > 0):
    // bill B terbaru yang sudah lunas tidak pernah masuk daftar ini.
    mocks.billFindMany.mockResolvedValue([
      { id: 5, goodsReceiptId: null, paidAmount: 200, balanceDue: 800, items: [] },
    ])
    mocks.transaction.mockImplementation(async (fn: any) => fn(purchaseTx(null)))

    await onPurchaseReturnProcessed(4, 7)

    // Retur 300 → A 800−300=500. Bill lunas tidak disentuh sama sekali.
    expect(mocks.billUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.billUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ balanceDue: 500, status: "partial" }),
      }),
    )
    // Query relief wajib menyaring bill terbuka saja.
    const reliefQuery = mocks.billFindMany.mock.calls
      .map((c: any[]) => c[0])
      .find((a: any) => a?.where?.balanceDue?.gt === 0)
    expect(reliefQuery).toBeDefined()
    expect(reliefQuery.where.status).toEqual({ in: ["posted", "partial"] })
  })

  it("R8-JB-03: relief menyebar ke bill terbuka berikutnya bila satu bill tidak cukup", async () => {
    mocks.purchaseReturnFind.mockResolvedValue({
      id: 5,
      documentNo: "PR-3",
      purchaseOrderId: 7,
      date: new Date("2026-10-04T00:00:00Z"),
      items: [{ qty: 10, cost: 100 }],
    })
    mocks.billFindMany.mockResolvedValue([
      { id: 5, goodsReceiptId: null, paidAmount: 200, balanceDue: 800, items: [] },
      { id: 6, goodsReceiptId: null, paidAmount: 0, balanceDue: 300, items: [] },
    ])
    mocks.transaction.mockImplementation(async (fn: any) => fn(purchaseTx(null)))

    await onPurchaseReturnProcessed(5, 7)

    // Retur 1000: A habis 800 → 0/paid, sisa 200 ke B → 100/partial.
    expect(mocks.billUpdate).toHaveBeenCalledTimes(2)
    expect(mocks.billUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ balanceDue: 0, status: "paid" }),
      }),
    )
    expect(mocks.billUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 6 },
        data: expect.objectContaining({ balanceDue: 100, status: "partial" }),
      }),
    )
    // Tertelan penuh oleh bill terbuka → tidak ada kelebihan → tanpa kredit.
    expect(mocks.vendorCreditCreate).not.toHaveBeenCalled()
  })

  it("lanjutan R8-JB-03: kelebihan relief di atas bill terbuka menjadi VendorCredit", async () => {
    mocks.purchaseReturnFind.mockResolvedValue({
      id: 6,
      documentNo: "PR-4",
      purchaseOrderId: 7,
      date: new Date("2026-10-05T00:00:00Z"),
      items: [{ qty: 10, cost: 100 }],
    })
    // Bill terbuka hanya 800; retur 1000 → 800 relief + 200 kelebihan.
    mocks.billFindMany.mockResolvedValue([
      { id: 5, goodsReceiptId: null, paidAmount: 200, balanceDue: 800, items: [] },
    ])
    mocks.transaction.mockImplementation(async (fn: any) => fn(purchaseTx(null)))

    await onPurchaseReturnProcessed(6, 7)

    expect(mocks.billUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ balanceDue: 0, status: "paid" }),
      }),
    )
    expect(mocks.vendorCreditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendorId: 9,
          sourceType: "PurchaseReturn",
          sourceId: 6,
          receivedAmount: 200,
        }),
      }),
    )
  })

  it("lanjutan R8-JB-03: tanpa bill terbuka sama sekali, seluruh relief menjadi VendorCredit", async () => {
    mocks.purchaseReturnFind.mockResolvedValue({
      id: 7,
      documentNo: "PR-5",
      purchaseOrderId: 7,
      date: new Date("2026-10-06T00:00:00Z"),
      items: [{ qty: 3, cost: 100 }],
    })
    mocks.billFindMany.mockResolvedValue([])
    mocks.transaction.mockImplementation(async (fn: any) => fn(purchaseTx(null)))

    await onPurchaseReturnProcessed(7, 7)

    expect(mocks.billUpdate).not.toHaveBeenCalled()
    expect(mocks.vendorCreditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vendorId: 9, sourceId: 7, receivedAmount: 300 }),
      }),
    )
  })
})
