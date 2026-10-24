/**
 * E-DP-PPN hook (F-2026-10-25-004-V): J-DP1 pecah PPN di
 * onDownPaymentReceived + J-PL1 reklas anti-dobel di
 * onSalesInvoicePosted. Mock pola accounting-hook.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { onDownPaymentReceived, onSalesInvoicePosted } from "../accounting.hook"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  settings: {
    salesReceivableAccountId: 110 as number | null,
    salesRevenueAccountId: 410 as number | null,
    salesTaxAccountId: 160 as number | null,
    cashBankAccountId: 100 as number | null,
    customerDownPaymentAccountId: 210102 as number | null,
    scrapSaleIncomeAccountId: null as number | null,
    cogsAccountId: 510 as number | null,
    inventoryAccountId: 130 as number | null,
  },
  dpFindUniqueOrThrow: vi.fn(),
  dpUpdate: vi.fn().mockResolvedValue({}),
  dpFindMany: vi.fn().mockResolvedValue([]),
  journalFindFirst: vi.fn().mockResolvedValue(null),
  journalCreate: vi.fn().mockResolvedValue({ id: 9 }),
  entryCreateMany: vi.fn().mockResolvedValue({ count: 0 }),
  invoiceFindUniqueOrThrow: vi.fn(),
  invoiceFindUnique: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: any) => mocks.transaction(fn),
    systemSetting: { findFirst: () => mocks.settings },
    downPayment: { findUniqueOrThrow: mocks.dpFindUniqueOrThrow },
    salesInvoice: {
      findUniqueOrThrow: mocks.invoiceFindUniqueOrThrow,
      findUnique: mocks.invoiceFindUnique,
    },
    journal: { findFirst: mocks.journalFindFirst },
  },
}))
vi.mock("@/lib/services/period-lock.service", () => ({ assertPeriodOpen: vi.fn() }))
vi.mock("@/lib/services/inventory-fifo", () => ({ consumeFifoLayers: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumberBatch: vi.fn() }))

function dpTx() {
  return {
    systemSetting: { findFirst: vi.fn().mockResolvedValue(mocks.settings) },
    downPayment: { findUniqueOrThrow: mocks.dpFindUniqueOrThrow, update: mocks.dpUpdate },
    journal: { findFirst: mocks.journalFindFirst, create: mocks.journalCreate },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.journalFindFirst.mockResolvedValue(null)
  mocks.journalCreate.mockResolvedValue({ id: 9 })
  mocks.dpUpdate.mockResolvedValue({})
  mocks.dpFindMany.mockResolvedValue([])
  mocks.settings.salesTaxAccountId = 160
  mocks.transaction.mockImplementation((fn: any) => fn(dpTx()))
})

describe("J-DP1: DP terutang membekukan snapshot + jurnal pecah", () => {
  it("DP 12.000.000 quotation ber-PPN: Cr 210102 10.680.000 + Cr 210201 1.320.000, snapshot tertulis", async () => {
    mocks.dpFindUniqueOrThrow.mockResolvedValue({
      id: 1,
      documentNo: "DP-1",
      amount: 12_000_000,
      paymentDate: new Date(2026, 0, 15),
      quotation: { tax: 13_200_000 },
    })
    await onDownPaymentReceived(1, 7)
    expect(mocks.dpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vatDpp: 11_000_000, vatAmount: 1_320_000, vatTaxPeriod: "2026-01" }),
      }),
    )
    const entries = mocks.journalCreate.mock.calls[0][0].data.entries.create
    expect(entries).toEqual([
      { accountId: 100, debit: 12_000_000, credit: 0, memo: "Bank/Cash received" },
      { accountId: 210102, debit: 0, credit: 10_680_000, memo: "Uang Muka Penjualan (neto PPN uang muka)" },
      { accountId: 160, debit: 0, credit: 1_320_000, memo: "PPN Keluaran uang muka (FP UM)" },
    ])
  })

  it("quotation tanpa PPN: J-DP2 bruto persis perilaku lama", async () => {
    mocks.dpFindUniqueOrThrow.mockResolvedValue({
      id: 1,
      documentNo: "DP-1",
      amount: 500,
      paymentDate: new Date(),
      quotation: { tax: 0 },
    })
    await onDownPaymentReceived(1)
    const entries = mocks.journalCreate.mock.calls[0][0].data.entries.create
    expect(entries).toHaveLength(2)
    expect(entries[1]).toEqual({ accountId: 210102, debit: 0, credit: 500, memo: "Uang Muka Penjualan" })
  })

  it("akun PPN kosong + DP terutang = fail-closed, tanpa jurnal", async () => {
    mocks.settings.salesTaxAccountId = null
    mocks.dpFindUniqueOrThrow.mockResolvedValue({
      id: 1,
      documentNo: "DP-1",
      amount: 12_000_000,
      paymentDate: new Date(),
      quotation: { tax: 1 },
    })
    await expect(onDownPaymentReceived(1)).rejects.toThrow(/PPN Keluaran/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("replay: jurnal sudah ada -> tidak ada jurnal kedua, snapshot tidak ditulis ulang", async () => {
    mocks.journalFindFirst.mockResolvedValue({ id: 7 })
    mocks.dpFindUniqueOrThrow.mockResolvedValue({ id: 1, amount: 500, paymentDate: new Date(), quotation: { tax: 1 } })
    await onDownPaymentReceived(1)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.dpUpdate).not.toHaveBeenCalled()
  })
})

describe("J-PL1: posting faktur pelunasan reklas anti-dobel", () => {
  function invoiceTx() {
    return {
      systemSetting: { findFirst: vi.fn().mockResolvedValue(mocks.settings) },
      salesInvoice: { findUniqueOrThrow: mocks.invoiceFindUniqueOrThrow, findUnique: mocks.invoiceFindUnique },
      downPayment: { findMany: mocks.dpFindMany },
      journal: { findFirst: mocks.journalFindFirst, create: mocks.journalCreate },
      journalEntry: { createMany: mocks.entryCreateMany },
      item: { findMany: vi.fn().mockResolvedValue([]) },
      uomConversion: { findMany: vi.fn().mockResolvedValue([]) },
      stockMove: { findFirst: vi.fn().mockResolvedValue(null) },
      $queryRaw: vi.fn(),
    }
  }

  it("Sigma PPN UM 1.320.000: kaki reklas Dr 210201 / Cr Piutang masuk jurnal sama", async () => {
    mocks.transaction.mockImplementation((fn: any) => fn(invoiceTx()))
    const inv = { id: 5, totalAmount: 120_000_000, taxAmount: 13_200_000, date: new Date(), documentNo: "INV-1", quotationId: 10 }
    mocks.invoiceFindUniqueOrThrow.mockResolvedValue({ ...inv, items: [] })
    mocks.invoiceFindUnique.mockResolvedValue(inv)
    mocks.dpFindMany.mockResolvedValue([{ vatDpp: 11_000_000, vatAmount: 1_320_000 }])
    await onSalesInvoicePosted(5)
    const data = mocks.entryCreateMany.mock.calls[0][0].data
    expect(data).toContainEqual(
      expect.objectContaining({ accountId: 160, debit: 1_320_000, credit: 0, memo: expect.stringContaining("Reklas PPN uang muka") }),
    )
    expect(data).toContainEqual(
      expect.objectContaining({ accountId: 110, debit: 0, credit: 1_320_000 }),
    )
    const debit = data.reduce((s: number, e: any) => s + Number(e.debit), 0)
    const credit = data.reduce((s: number, e: any) => s + Number(e.credit), 0)
    expect(debit).toBe(credit)
  })

  it("PPN dokumen < Sigma PPN UM = fail-closed sebelum jurnal", async () => {
    mocks.transaction.mockImplementation((fn: any) => fn(invoiceTx()))
    const inv = { id: 5, totalAmount: 6_000_000, taxAmount: 600_000, date: new Date(), documentNo: "INV-1", quotationId: 10 }
    mocks.invoiceFindUniqueOrThrow.mockResolvedValue({ ...inv, items: [] })
    mocks.invoiceFindUnique.mockResolvedValue(inv)
    mocks.dpFindMany.mockResolvedValue([{ vatDpp: 11_000_000, vatAmount: 1_320_000 }])
    await expect(onSalesInvoicePosted(5)).rejects.toThrow(/lebih kecil dari Sigma/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })
})
