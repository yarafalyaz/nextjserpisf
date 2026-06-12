import { describe, it, expect, vi, beforeEach } from "vitest"
import { deleteJournalByReference, deleteJournalByReferenceTx, onSalesInvoicePosted, onSalesPaymentCreated, onPurchaseOrderReceived } from "../accounting.hook"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  deleteManyEntries: vi.fn(),
  deleteManyJournals: vi.fn(),
  systemSettings: {
    salesReceivableAccountId: 110 as number | null,
    salesRevenueAccountId: 410 as number | null,
    cogsAccountId: 510 as number | null,
    inventoryAccountId: 130 as number | null,
    cashBankAccountId: 100 as number | null,
    purchasePayableAccountId: 210 as number | null,
    purchaseTaxAccountId: 150 as number | null,
  },
  assertPeriodOpen: vi.fn(),
  fifoConsume: vi.fn(),
  invoiceFindUniqueOrThrow: vi.fn(),
  invoiceFindUnique: vi.fn(),
  journalFindFirst: vi.fn(),
  journalCreate: vi.fn(),
  journalEntryCreate: vi.fn(),
  journalEntryCreateMany: vi.fn(),
  itemFindUnique: vi.fn(),
  paymentFindUniqueOrThrow: vi.fn(),
  orderFindUniqueOrThrow: vi.fn(),
  itemUpdate: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: any) => mocks.transaction(fn),
    systemSetting: { findFirst: () => mocks.systemSettings },
    salesInvoice: { findUniqueOrThrow: (...a: unknown[]) => mocks.invoiceFindUniqueOrThrow(...a) },
    salesPayment: { findUniqueOrThrow: (...a: unknown[]) => mocks.paymentFindUniqueOrThrow(...a) },
    purchaseOrder: { findUniqueOrThrow: (...a: unknown[]) => mocks.orderFindUniqueOrThrow(...a) },
    journal: { findFirst: (...a: unknown[]) => mocks.journalFindFirst(...a) },
  },
}))

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => mocks.assertPeriodOpen(...a),
}))

vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: (...a: unknown[]) => mocks.fifoConsume(...a),
}))

describe("deleteJournalByReference", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation((fn: any) => fn({
      journal: { findMany: mocks.findMany, deleteMany: mocks.deleteManyJournals },
      journalEntry: { deleteMany: mocks.deleteManyEntries },
    }))
  })

  it("deletes entries and journals when found", async () => {
    mocks.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    await deleteJournalByReference("VendorBill", 100)
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { referenceType: "VendorBill", referenceId: 100 },
      select: { id: true },
    })
    expect(mocks.deleteManyEntries).toHaveBeenCalledWith({ where: { journalId: { in: [1, 2] } } })
    expect(mocks.deleteManyJournals).toHaveBeenCalledWith({ where: { id: { in: [1, 2] } } })
  })

  it("returns early if no journals found", async () => {
    mocks.findMany.mockResolvedValue([])
    await deleteJournalByReference("VendorBill", 999)
    expect(mocks.deleteManyEntries).not.toHaveBeenCalled()
    expect(mocks.deleteManyJournals).not.toHaveBeenCalled()
  })

  it("uses provided txClient if passed", async () => {
    const tx = {
      journal: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
      journalEntry: { deleteMany: vi.fn() },
    }
    await (deleteJournalByReference as any)("Payment", 50, tx)
    expect(tx.journal.findMany).toHaveBeenCalled()
    // Prisma global transaction shouldn't be called
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("handles array referenceType and referenceId natively in deleteJournalByReferenceTx", async () => {
    const tx = {
      journal: { findMany: vi.fn().mockResolvedValue([{ id: 7 }]), deleteMany: vi.fn() },
      journalEntry: { deleteMany: vi.fn() },
    }
    await deleteJournalByReferenceTx(tx as any, ["SalesInvoice", "COGS"], [10, 11])
    expect(tx.journal.findMany).toHaveBeenCalledWith({
      where: {
        referenceType: { in: ["SalesInvoice", "COGS"] },
        referenceId: { in: [10, 11] }
      },
      select: { id: true }
    })
    expect(tx.journalEntry.deleteMany).toHaveBeenCalledWith({ where: { journalId: { in: [7] } } })
  })
})

describe("onSalesInvoicePosted", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset systemSettings to valid mappings (a prior test may have nulled one).
    mocks.systemSettings.salesReceivableAccountId = 110
    mocks.systemSettings.salesRevenueAccountId = 410
    mocks.systemSettings.cogsAccountId = 510
    mocks.systemSettings.inventoryAccountId = 130
    mocks.transaction.mockImplementation((fn: any) => fn({
      systemSetting: { findFirst: vi.fn().mockResolvedValue(mocks.systemSettings) },
      salesInvoice: { findUniqueOrThrow: mocks.invoiceFindUniqueOrThrow, findUnique: mocks.invoiceFindUnique },
      journal: { findFirst: mocks.journalFindFirst, create: mocks.journalCreate },
      journalEntry: { createMany: mocks.journalEntryCreateMany },
      item: { findUnique: mocks.itemFindUnique, update: mocks.itemUpdate },
    }))
  })

  it("returns early if system settings are missing account mappings", async () => {
    (mocks.systemSettings as any).salesReceivableAccountId = null
    await onSalesInvoicePosted(1)
    expect(mocks.invoiceFindUniqueOrThrow).not.toHaveBeenCalled()
  })

  it("returns early if journal already exists (idempotency)", async () => {
    mocks.invoiceFindUniqueOrThrow.mockResolvedValue({ id: 1, date: new Date() })
    mocks.journalFindFirst.mockResolvedValue({ id: 99 }) // Existing journal
    await onSalesInvoicePosted(1)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })
})

describe("onSalesPaymentCreated", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.systemSettings.salesReceivableAccountId = 110
    mocks.systemSettings.cashBankAccountId = 100
    mocks.transaction.mockImplementation((fn: any) => fn({
      systemSetting: { findFirst: vi.fn().mockResolvedValue(mocks.systemSettings) },
      salesPayment: { findUniqueOrThrow: mocks.paymentFindUniqueOrThrow },
      journal: { findFirst: mocks.journalFindFirst, create: mocks.journalCreate },
      journalEntry: { create: mocks.journalEntryCreate },
    }))
  })

  it("returns early if no salesReceivableAccountId", async () => {
    (mocks.systemSettings as any).salesReceivableAccountId = null
    await onSalesPaymentCreated(1)
    expect(mocks.paymentFindUniqueOrThrow).not.toHaveBeenCalled()
  })

  it("returns early if idempotency check finds journal", async () => {
    mocks.paymentFindUniqueOrThrow.mockResolvedValue({ id: 1, amount: 500 })
    mocks.journalFindFirst.mockResolvedValue({ id: 88 })
    await onSalesPaymentCreated(1)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("returns early if cash account cannot be determined", async () => {
    (mocks.systemSettings as any).cashBankAccountId = null
    mocks.paymentFindUniqueOrThrow.mockResolvedValue({ id: 1, amount: 500, accountId: null })
    mocks.journalFindFirst.mockResolvedValue(null)
    await onSalesPaymentCreated(1)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("creates journal and entries for valid payment", async () => {
    mocks.paymentFindUniqueOrThrow.mockResolvedValue({ id: 1, amount: 500, paymentDate: new Date(), accountId: 101, salesInvoice: { documentNo: "INV-1" } })
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.journalCreate.mockResolvedValue({ id: 99 })
    await onSalesPaymentCreated(1, 999)

    expect(mocks.journalCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ referenceType: "SalesPayment", totalDebit: 500, totalCredit: 500 })
    }))
    expect(mocks.journalEntryCreate).toHaveBeenCalledTimes(2)
    expect(mocks.journalEntryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accountId: 101, debit: 500, credit: 0 })
    }))
    expect(mocks.journalEntryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accountId: 110, debit: 0, credit: 500 })
    }))
  })
})

describe("onPurchaseOrderReceived", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.systemSettings.inventoryAccountId = 130
    mocks.systemSettings.purchasePayableAccountId = 210
    mocks.systemSettings.purchaseTaxAccountId = 150
    mocks.transaction.mockImplementation((fn: any) => fn({
      systemSetting: { findFirst: vi.fn().mockResolvedValue(mocks.systemSettings) },
      purchaseOrder: { findUniqueOrThrow: mocks.orderFindUniqueOrThrow },
      journal: { findFirst: mocks.journalFindFirst, create: mocks.journalCreate },
      journalEntry: { create: mocks.journalEntryCreate },
    }))
  })

  it("returns early if required account mappings are missing", async () => {
    (mocks.systemSettings as any).inventoryAccountId = null
    await onPurchaseOrderReceived(1)
    expect(mocks.orderFindUniqueOrThrow).not.toHaveBeenCalled()
  })

  it("returns early if journal already exists (idempotency)", async () => {
    mocks.orderFindUniqueOrThrow.mockResolvedValue({ id: 1, totalAmount: 1000, documentNo: "PO-1" })
    mocks.journalFindFirst.mockResolvedValue({ id: 7 })
    await onPurchaseOrderReceived(1)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("creates journal with PPN Masukan when tax account is configured and tax > 0", async () => {
    mocks.orderFindUniqueOrThrow.mockResolvedValue({ id: 1, totalAmount: 1100, tax: 100, documentNo: "PO-1" })
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.journalCreate.mockResolvedValue({ id: 9 })
    await onPurchaseOrderReceived(1, 999)

    expect(mocks.journalCreate).toHaveBeenCalled()
    // 3 entries: Dr. Inventory, Dr. PPN, Cr. Hutang
    expect(mocks.journalEntryCreate).toHaveBeenCalledTimes(3)
    // PPN
    expect(mocks.journalEntryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accountId: 150, debit: 100, credit: 0 })
    }))
    // Hutang full
    expect(mocks.journalEntryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accountId: 210, debit: 0, credit: 1100 })
    }))
  })

  it("absorbs tax into inventory when no input-tax account is configured", async () => {
    (mocks.systemSettings as any).purchaseTaxAccountId = null
    mocks.orderFindUniqueOrThrow.mockResolvedValue({ id: 1, totalAmount: 1100, tax: 100, documentNo: "PO-1" })
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.journalCreate.mockResolvedValue({ id: 9 })
    await onPurchaseOrderReceived(1)

    // Only 2 entries: Dr. Inventory (absorbs tax), Cr. Hutang
    expect(mocks.journalEntryCreate).toHaveBeenCalledTimes(2)
    expect(mocks.journalEntryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accountId: 130, debit: 1100, credit: 0 })
    }))
  })
})
