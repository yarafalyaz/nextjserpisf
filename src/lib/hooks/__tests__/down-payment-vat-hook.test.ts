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
    // F-015-V: default PKP efektif sebelum paymentDate tes (J-DP1 tetap).
    companyPkpStatus: "pkp" as string,
    companyPkpEffectiveFrom: new Date(2025, 0, 1) as Date | null,
    scrapSaleIncomeAccountId: null as number | null,
    cogsAccountId: 510 as number | null,
    inventoryAccountId: 130 as number | null,
  },
  dpFindUniqueOrThrow: vi.fn(),
  dpUpdate: vi.fn().mockResolvedValue({}),
  dpFindMany: vi.fn().mockResolvedValue([]),
  taxFindMany: vi.fn().mockResolvedValue([
    { rate: 12, effectiveFrom: new Date(2026, 0, 1), effectiveTo: null, isActive: true, deletedAt: null },
  ]),
  salesPaymentFindMany: vi.fn().mockResolvedValue([]),
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
    tax: { findMany: mocks.taxFindMany },
    journal: { findFirst: mocks.journalFindFirst, create: mocks.journalCreate },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.journalFindFirst.mockResolvedValue(null)
  mocks.journalCreate.mockResolvedValue({ id: 9 })
  mocks.dpUpdate.mockResolvedValue({})
  mocks.dpFindMany.mockResolvedValue([])
  mocks.taxFindMany.mockResolvedValue([
    { rate: 12, effectiveFrom: new Date(2026, 0, 1), effectiveTo: null, isActive: true, deletedAt: null },
  ])
  mocks.salesPaymentFindMany.mockResolvedValue([])
  mocks.settings.salesTaxAccountId = 160
  mocks.settings.companyPkpStatus = "pkp"
  mocks.settings.companyPkpEffectiveFrom = new Date(2025, 0, 1)
  mocks.transaction.mockImplementation((fn: any) => fn(dpTx()))
})

const dpPpn = {
  id: 1,
  documentNo: "DP-1",
  amount: 12_000_000,
  paymentDate: new Date(2026, 0, 15),
  quotation: { tax: 13_200_000 },
}

describe("J-DP1: DP terutang membekukan snapshot + jurnal pecah", () => {
  it("DP 12.000.000 quotation ber-PPN: Cr 210102 10.680.000 + Cr 210201 1.320.000, snapshot tertulis", async () => {
    mocks.dpFindUniqueOrThrow.mockResolvedValue(dpPpn)
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

  it("B1: tanpa baris master Tax efektif pada paymentDate = fail-closed, tanpa jurnal/snapshot", async () => {
    mocks.taxFindMany.mockResolvedValue([])
    mocks.dpFindUniqueOrThrow.mockResolvedValue(dpPpn)
    await expect(onDownPaymentReceived(1)).rejects.toThrow(/tidak ada baris master Tax/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.dpUpdate).not.toHaveBeenCalled()
  })

  it("B1: tarif master efektif yang dipakai snapshot (master 11% -> PPN bukan 1.320.000)", async () => {
    mocks.taxFindMany.mockResolvedValue([
      { rate: 11, effectiveFrom: new Date(2026, 0, 1), effectiveTo: null, isActive: true, deletedAt: null },
    ])
    mocks.dpFindUniqueOrThrow.mockResolvedValue(dpPpn)
    await onDownPaymentReceived(1)
    expect(mocks.dpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vatRate: 11, vatAmount: 1_210_000 }) }),
    )
  })

  it("E-DP-PPN (9): periode tertutup pada paymentDate = ditolak assertPeriodOpen, tanpa jurnal", async () => {
    const { assertPeriodOpen } = await import("@/lib/services/period-lock.service")
    vi.mocked(assertPeriodOpen).mockRejectedValueOnce(new Error("Periode 2026-01 terkunci"))
    mocks.dpFindUniqueOrThrow.mockResolvedValue(dpPpn)
    await expect(onDownPaymentReceived(1)).rejects.toThrow(/terkunci/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })
})

describe("B-PKP F-015-V: gerbang PKP perusahaan di onDownPaymentReceived (falsifikasi vonis 1-6)", () => {
  function expectNoJournalOrSnapshot() {
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.dpUpdate).not.toHaveBeenCalled()
  }
  function journalEntries() {
    return mocks.journalCreate.mock.calls[0][0].data.entries.create as any[]
  }

  it("(1) unknown + DP ber-PPN ditolak berisik, tanpa jurnal/snapshot/master-tax query", async () => {
    mocks.settings.companyPkpStatus = "unknown"
    mocks.settings.companyPkpEffectiveFrom = null
    mocks.dpFindUniqueOrThrow.mockResolvedValue(dpPpn)
    await expect(onDownPaymentReceived(1)).rejects.toThrow(/status PKP perusahaan belum ditetapkan/)
    expectNoJournalOrSnapshot()
    expect(mocks.taxFindMany).not.toHaveBeenCalled()
  })

  it("(2) non_pkp -> J-DP2 bruto penuh, nol kaki 210201, snapshot PKP beku non_pkp", async () => {
    mocks.settings.companyPkpStatus = "non_pkp"
    mocks.settings.companyPkpEffectiveFrom = null
    mocks.dpFindUniqueOrThrow.mockResolvedValue(dpPpn)
    await onDownPaymentReceived(1)
    const entries = journalEntries()
    expect(entries).toHaveLength(2)
    expect(entries.some((e) => e.accountId === 160)).toBe(false)
    expect(entries[1]).toEqual({ accountId: 210102, debit: 0, credit: 12_000_000, memo: "Uang Muka Penjualan" })
    expect(mocks.dpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vatAmount: 0, companyPkpStatusSnapshot: "non_pkp" }),
      }),
    )
  })

  it("(3) EffectiveFrom sesudah paymentDate -> J-DP2; digeser <= paymentDate -> J-DP1 (hasil berbalik)", async () => {
    mocks.settings.companyPkpEffectiveFrom = new Date(2026, 0, 16)
    mocks.dpFindUniqueOrThrow.mockResolvedValue(dpPpn)
    await onDownPaymentReceived(1)
    expect(journalEntries().some((e) => e.accountId === 160)).toBe(false)

    vi.clearAllMocks()
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.journalCreate.mockResolvedValue({ id: 9 })
    mocks.dpUpdate.mockResolvedValue({})
    mocks.settings.companyPkpStatus = "pkp"
    mocks.settings.companyPkpEffectiveFrom = new Date(2026, 0, 15)
    mocks.dpFindUniqueOrThrow.mockResolvedValue(dpPpn)
    await onDownPaymentReceived(1)
    expect(journalEntries()).toContainEqual(
      expect.objectContaining({ accountId: 160, credit: 1_320_000 }),
    )
    expect(mocks.dpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyPkpStatusSnapshot: "pkp", vatAmount: 1_320_000 }),
      }),
    )
  })

  it("(4) status diubah sesudah DP terbit: snapshot tersimpan byte-sama, tidak ditulis ulang", async () => {
    // DP sudah bersnapshot (vat* + PKP beku pkp); master kini non_pkp.
    mocks.settings.companyPkpStatus = "non_pkp"
    mocks.settings.companyPkpEffectiveFrom = null
    mocks.dpFindUniqueOrThrow.mockResolvedValue({
      ...dpPpn,
      vatTransactionCode: "04",
      vatRate: 12,
      vatDpp: 11_000_000,
      vatAmount: 1_320_000,
      vatTaxPeriod: "2026-01",
      companyPkpStatusSnapshot: "pkp",
      companyPkpEffectiveFromSnapshot: new Date(2025, 0, 1),
    })
    await onDownPaymentReceived(1)
    expect(mocks.dpUpdate).not.toHaveBeenCalled()
    expect(journalEntries()).toContainEqual(expect.objectContaining({ accountId: 160, credit: 1_320_000 }))
  })

  it("(5) pkp tanpa EffectiveFrom = fail-closed berisik, tanpa jurnal", async () => {
    mocks.settings.companyPkpEffectiveFrom = null
    mocks.dpFindUniqueOrThrow.mockResolvedValue(dpPpn)
    await expect(onDownPaymentReceived(1)).rejects.toThrow(/tanggal mulai kewajiban PKP belum diisi/)
    expectNoJournalOrSnapshot()
  })

  it("(6) quotation tax=0 + unknown tetap lolos J-DP2", async () => {
    mocks.settings.companyPkpStatus = "unknown"
    mocks.settings.companyPkpEffectiveFrom = null
    mocks.dpFindUniqueOrThrow.mockResolvedValue({ ...dpPpn, amount: 500, quotation: { tax: 0 } })
    await onDownPaymentReceived(1)
    const entries = journalEntries()
    expect(entries).toHaveLength(2)
    expect(entries[1].credit).toBe(500)
  })
})

describe("J-PL1: posting faktur pelunasan reklas anti-dobel", () => {
  function invoiceTx() {
    return {
      systemSetting: { findFirst: vi.fn().mockResolvedValue(mocks.settings) },
      salesInvoice: { findUniqueOrThrow: mocks.invoiceFindUniqueOrThrow, findUnique: mocks.invoiceFindUnique },
      downPayment: { findMany: mocks.dpFindMany },
      salesPayment: { findMany: mocks.salesPaymentFindMany },
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

  it("B4 jalur konversi: penutup Dr 210102 neto / Cr Piutang neto di jurnal posting; 210102 tertutup, sisa piutang = grandTotal - alokasi bruto", async () => {
    mocks.transaction.mockImplementation((fn: any) => fn(invoiceTx()))
    const inv = { id: 5, totalAmount: 120_000_000, taxAmount: 13_200_000, date: new Date(), documentNo: "INV-1", quotationId: 10 }
    mocks.invoiceFindUniqueOrThrow.mockResolvedValue({ ...inv, items: [] })
    mocks.invoiceFindUnique.mockResolvedValue(inv)
    // findMany pertama = baris snapshot Sigma J-PL1; kedua = DP alokasi konversi.
    mocks.dpFindMany
      .mockResolvedValueOnce([{ vatDpp: 11_000_000, vatAmount: 1_320_000 }])
      .mockResolvedValueOnce([
        {
          id: 3,
          documentNo: "DP-0001",
          status: "confirmed",
          amount: 12_000_000,
          vatTransactionCode: "04",
          vatRate: 12,
          vatDpp: 11_000_000,
          vatAmount: 1_320_000,
          vatTaxPeriod: "2026-01",
        },
      ])
    mocks.salesPaymentFindMany.mockResolvedValue([
      { id: 21, amount: 12_000_000, notes: "Uang muka dari DP DP-0001" },
    ])
    // journalFindFirst: existing (null) -> existingInTx (null) -> jurnal alokasi SalesPayment (null = belum ada)
    mocks.journalFindFirst.mockResolvedValue(null)
    await onSalesInvoicePosted(5)
    const data = mocks.entryCreateMany.mock.calls[0][0].data
    expect(data).toContainEqual(
      expect.objectContaining({ accountId: 210102, debit: 10_680_000, credit: 0, memo: expect.stringContaining("Penutup kewajiban UMP") }),
    )
    expect(data).toContainEqual(
      expect.objectContaining({ accountId: 110, debit: 0, credit: 10_680_000, memo: expect.stringContaining("Penutup piutang") }),
    )
    const debit = data.reduce((s: number, e: any) => s + Number(e.debit), 0)
    const credit = data.reduce((s: number, e: any) => s + Number(e.credit), 0)
    expect(debit).toBe(credit)
    // Sisa piutang GL: Dr grandTotal - Cr reklas Sigma - Cr penutup neto
    // = 120.000.000 - 1.320.000 - 10.680.000 = grandTotal - alokasi bruto 12.000.000.
    const arNet = data
      .filter((e: any) => e.accountId === 110)
      .reduce((s: number, e: any) => s + Number(e.debit) - Number(e.credit), 0)
    expect(arNet).toBe(120_000_000 - 12_000_000)
  })

  it("B4: DP yang sudah punya jurnal alokasi SalesPayment (jalur existingInv) dilewati — tidak dobel tutup", async () => {
    mocks.transaction.mockImplementation((fn: any) => fn(invoiceTx()))
    const inv = { id: 5, totalAmount: 120_000_000, taxAmount: 13_200_000, date: new Date(), documentNo: "INV-1", quotationId: 10 }
    mocks.invoiceFindUniqueOrThrow.mockResolvedValue({ ...inv, items: [] })
    mocks.invoiceFindUnique.mockResolvedValue(inv)
    mocks.dpFindMany
      .mockResolvedValueOnce([{ vatDpp: 11_000_000, vatAmount: 1_320_000 }])
      .mockResolvedValueOnce([
        {
          id: 3,
          documentNo: "DP-0001",
          status: "confirmed",
          amount: 12_000_000,
          vatTransactionCode: "04",
          vatRate: 12,
          vatDpp: 11_000_000,
          vatAmount: 1_320_000,
          vatTaxPeriod: "2026-01",
        },
      ])
    mocks.salesPaymentFindMany.mockResolvedValue([
      { id: 21, amount: 12_000_000, notes: "Uang muka dari DP DP-0001" },
    ])
    // findFirst diskriminasi: jurnal alokasi SalesPayment sudah ada (77),
    // jurnal posting faktur belum.
    mocks.journalFindFirst.mockImplementation((args: any) =>
      Promise.resolve(args?.where?.referenceType === "SalesPayment" ? { id: 77 } : null),
    )
    await onSalesInvoicePosted(5)
    const data = mocks.entryCreateMany.mock.calls[0][0].data
    expect(data.some((e: any) => String(e.memo).includes("Penutup kewajiban UMP"))).toBe(false)
  })
})
