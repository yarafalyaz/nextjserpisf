import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader read-model SPT — perf HIGH: rentang periode harus didorong ke
 * `where` Prisma (ekuivalen dengan filter masa in-memory lama), dan rantai
 * pengganti dibangun dari Map (bukan `find` O(n²) di loop).
 *
 * Bukti ekuivalensi: mock Prisma menerapkan `where` tersaring secara
 * jujur atas fixture campuran (dalam/luar periode, tanpa tanggal), lalu
 * keluaran dibandingkan dengan ekspektasi hitung-tangan dari SEMUA baris
 * yang lolos filter masa lama — bukan hanya bentuk query.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    taxInvoice: { findMany: vi.fn() },
    salesInvoice: { findMany: vi.fn() },
    vendorBill: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn() },
    taxPayment: { findMany: vi.fn() },
  },
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: mocks.getSystemSettings }))

import { loadSptPeriodRows, loadSptPeriodRowsForRange } from "../spt-read-model-data"

// ---------------------------------------------------------------------------
// Fixture campuran. Rentang uji: 2026-01 (start 10 Jan, end 20 Jan — sengaja
// bukan batas bulan, membuktikan query memakai awal/akhir MASA, bukan
// tanggal mentah caller).
// ---------------------------------------------------------------------------

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

const TAX_INVOICES = [
  // Rantai keluaran asal Jan: 1 (approved) -> 2 (replaced, nol-efek) -> 3 (approved, kepala)
  { id: 1, direction: "out", taxPeriod: "2026-01", creditPeriod: null, creditStatus: "uncredited", dpp: 1000, taxAmount: 110, djpStatus: "approved", creditablePercent: 100, salesInvoiceId: 501, vendorBillId: null, replacesId: null },
  { id: 2, direction: "out", taxPeriod: "2026-01", creditPeriod: null, creditStatus: "uncredited", dpp: 1000, taxAmount: 110, djpStatus: "replaced", creditablePercent: 100, salesInvoiceId: 501, vendorBillId: null, replacesId: 1 },
  { id: 3, direction: "out", taxPeriod: "2026-01", creditPeriod: null, creditStatus: "uncredited", dpp: 2000, taxAmount: 220, djpStatus: "approved", creditablePercent: 100, salesInvoiceId: 501, vendorBillId: null, replacesId: 2 },
  // Keluaran luar periode (Feb) — rantai utuh tetap dimuat, dibuang builder/filter akhir.
  { id: 4, direction: "out", taxPeriod: "2026-02", creditPeriod: null, creditStatus: "uncredited", dpp: 5000, taxAmount: 550, djpStatus: "approved", creditablePercent: 100, salesInvoiceId: 502, vendorBillId: null, replacesId: null },
  // Masukan credited masa kredit Jan (taxPeriod Des — masa kredit yang berlaku).
  { id: 5, direction: "in", taxPeriod: "2025-12", creditPeriod: "2026-01", creditStatus: "credited", dpp: 800, taxAmount: 88, djpStatus: "approved", creditablePercent: 100, salesInvoiceId: null, vendorBillId: 601, replacesId: null },
  // Masukan credited luar periode (creditPeriod Mar) — satu-satunya yang boleh dibuang DB.
  { id: 6, direction: "in", taxPeriod: "2026-03", creditPeriod: "2026-03", creditStatus: "credited", dpp: 900, taxAmount: 99, djpStatus: "approved", creditablePercent: 100, salesInvoiceId: null, vendorBillId: 602, replacesId: null },
  // Masukan tanpa tanggal terbukti (creditPeriod null, status bukan credited):
  // tetap dimuat DB & tetap menaungi bill legacy-nya (601? bukan — 603).
  { id: 7, direction: "in", taxPeriod: "2026-01", creditPeriod: null, creditStatus: "uncredited", dpp: 700, taxAmount: 77, djpStatus: "approved", creditablePercent: 100, salesInvoiceId: null, vendorBillId: 603, replacesId: null },
]

const SALES_INVOICES = [
  { id: 501, date: D(2026, 1, 15), subtotal: 10000, discount: 0, taxAmount: 1100, status: "posted", deletedAt: null }, // ternaungi TI 1-3
  { id: 502, date: D(2026, 2, 10), subtotal: 20000, discount: 0, taxAmount: 2200, status: "posted", deletedAt: null }, // luar periode (tanggal)
  { id: 503, date: D(2026, 1, 5), subtotal: 3000, discount: 500, taxAmount: 275, status: "posted", deletedAt: null }, // legacy Jan: dpp 2500 vat 275
  { id: 504, date: D(2025, 12, 20), subtotal: 4000, discount: 0, taxAmount: 440, status: "posted", deletedAt: null }, // luar periode (Des)
]

const VENDOR_BILLS = [
  { id: 601, date: D(2026, 1, 8), subtotal: 8000, discountAmount: 0, tax: 880, taxInvoiceNumber: "010.000-26.00000001", status: "posted", deletedAt: null }, // ternaungi TI 5
  { id: 602, date: D(2026, 3, 3), subtotal: 9000, discountAmount: 0, tax: 990, taxInvoiceNumber: "010.000-26.00000002", status: "posted", deletedAt: null }, // luar periode
  { id: 603, date: D(2026, 1, 12), subtotal: 7000, discountAmount: 0, tax: 770, taxInvoiceNumber: "010.000-26.00000003", status: "posted", deletedAt: null }, // ternaungi TI 7 (tanpa creditPeriod!)
  { id: 604, date: D(2026, 1, 20), subtotal: 2000, discountAmount: 200, tax: 198, taxInvoiceNumber: "010.000-26.00000004", status: "posted", deletedAt: null }, // legacy Jan: dpp 1800 vat 198
  { id: 605, date: D(2026, 1, 22), subtotal: 1000, discountAmount: 0, tax: 110, taxInvoiceNumber: null, status: "posted", deletedAt: null }, // nomor invalid -> skip legacy
]

const SALES_RETURNS = [
  // date luar (Feb), nota dalam (Jan 25) -> masa Jan, tetap dimuat.
  { status: "completed", date: D(2026, 2, 2), taxReturnNoteDate: D(2026, 1, 25), items: [{ returnDpp: 100, returnVat: 11 }] },
  // date dalam (Jan), nota luar (Feb) -> masa Feb (nota menang), dibuang filter akhir.
  { status: "completed", date: D(2026, 1, 10), taxReturnNoteDate: D(2026, 2, 1), items: [{ returnDpp: 200, returnVat: 22 }] },
  // keduanya luar -> dibuang DB.
  { status: "completed", date: D(2026, 3, 5), taxReturnNoteDate: null, items: [{ returnDpp: 300, returnVat: 33 }] },
  // legacy tanpa snapshot, date dalam, nota null -> masa Jan, vat 0.
  { status: "completed", date: D(2026, 1, 18), taxReturnNoteDate: null, items: [{ returnDpp: null, returnVat: null }] },
]

const JOURNAL_ENTRIES = [
  { accountId: 10, debit: 0, credit: 220, journal: { transactionDate: D(2026, 1, 15) } }, // ppn_out Jan
  { accountId: 20, debit: 88, credit: 0, journal: { transactionDate: D(2026, 1, 15) } }, // ppn_in Jan
  { accountId: 10, debit: 0, credit: 550, journal: { transactionDate: D(2026, 2, 15) } }, // luar periode
]

const TAX_PAYMENTS = [
  { period: "2026-01", amount: 100, taxKind: "ppn", deletedAt: null },
  { period: "2026-02", amount: 999, taxKind: "ppn", deletedAt: null }, // luar periode — dibuang DB
  { period: null, amount: 777, taxKind: "ppn", deletedAt: null }, // tanpa tanggal terbukti — tetap dimuat, tak ber-bucket
  { period: "2026-01", amount: 555, taxKind: "pph21", deletedAt: null }, // bukan ppn — diabaikan builder
]

// ---------------------------------------------------------------------------
// Mock Prisma jujur: menerapkan where (gte/lte, in, not, OR, relasi journal)
// atas fixture, mengembalikan salinan agar mutasi builder tak bocor.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

function matchValue(actual: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object" || cond instanceof Date) return actual === cond
  const c = cond as Record<string, unknown>
  if ("in" in c) return (c.in as unknown[]).includes(actual)
  if ("not" in c) return actual !== c.not
  if ("gt" in c) return (actual as number) > (c.gt as number)
  if ("gte" in c || "lte" in c) {
    const a = actual instanceof Date ? actual.getTime() : String(actual)
    if ("gte" in c) {
      const g = c.gte instanceof Date ? c.gte.getTime() : String(c.gte)
      if (!(a >= g)) return false
    }
    if ("lte" in c) {
      const l = c.lte instanceof Date ? c.lte.getTime() : String(c.lte)
      if (!(a <= l)) return false
    }
    return true
  }
  return true
}

function matches(row: Row, where?: Row): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Row[]).some((sub) => matches(row, sub))
    if (key === "journal") {
      const j = row.journal as Row
      return Object.entries(cond as Row).every(([jk, jc]) => {
        if (jk === "status") return matchValue("POSTED", jc) // fixture semua POSTED non-deleted
        if (jk === "deletedAt") return true
        return matchValue(j.transactionDate, jc)
      })
    }
    return matchValue(row[key], cond)
  })
}

const deep = <T,>(rows: T[]): T[] => rows.map((r) => structuredClone(r))

function wirePrisma() {
  mocks.prismaMock.taxInvoice.findMany.mockImplementation(async (args: { where?: Row }) =>
    deep(TAX_INVOICES.filter((r) => matches(r as Row, args?.where))),
  )
  mocks.prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where?: Row }) =>
    deep(SALES_INVOICES.filter((r) => matches(r as Row, args?.where))),
  )
  mocks.prismaMock.vendorBill.findMany.mockImplementation(async (args: { where?: Row }) =>
    deep(VENDOR_BILLS.filter((r) => matches(r as Row, args?.where))),
  )
  mocks.prismaMock.salesReturn.findMany.mockImplementation(async (args: { where?: Row }) =>
    deep(SALES_RETURNS.filter((r) => matches(r as Row, args?.where))),
  )
  mocks.prismaMock.journalEntry.findMany.mockImplementation(async (args: { where?: Row }) =>
    deep(JOURNAL_ENTRIES.filter((r) => matches(r as unknown as Row, args?.where))),
  )
  mocks.prismaMock.taxPayment.findMany.mockImplementation(async (args: { where?: Row }) =>
    deep(TAX_PAYMENTS.filter((r) => matches(r as Row, args?.where))),
  )
}

const RANGE = { start: D(2026, 1, 10), end: D(2026, 1, 20) }
// Awal/akhir masa dihitung produksi dari getter lokal atas start/end (tepi
// rentang, bukan tanggal dokumen). Pin kontrak yang sama di sini supaya
// aman di TZ apa pun: awal bulan start s/d akhir bulan end.
const RANGE_START = new Date(RANGE.start.getFullYear(), RANGE.start.getMonth(), 1)
const RANGE_END = new Date(RANGE.end.getFullYear(), RANGE.end.getMonth() + 1, 0, 23, 59, 59, 999)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSystemSettings.mockResolvedValue({ salesTaxAccountId: 10, purchaseTaxAccountId: 20 })
  wirePrisma()
})

describe("loadSptPeriodRowsForRange — filter periode di DB", () => {
  it("mendorong rentang masa (awal/akhir bulan inklusif) ke where Prisma", async () => {
    await loadSptPeriodRowsForRange(RANGE)

    expect(mocks.prismaMock.taxInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { direction: "out" },
            {
              direction: "in",
              OR: [
                { creditStatus: { not: "credited" } },
                { creditPeriod: null },
                { creditPeriod: { gte: "2026-01", lte: "2026-01" } },
              ],
            },
          ],
        },
      }),
    )
    // Query coverage cakupan legacy: tak tersaring, hanya 2 kolom id.
    expect(mocks.prismaMock.taxInvoice.findMany).toHaveBeenCalledWith({
      select: { salesInvoiceId: true, vendorBillId: true },
    })
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { gte: RANGE_START, lte: RANGE_END } }),
      }),
    )
    expect(mocks.prismaMock.vendorBill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { gte: RANGE_START, lte: RANGE_END } }),
      }),
    )
    expect(mocks.prismaMock.salesReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "completed",
          OR: [
            { date: { gte: RANGE_START, lte: RANGE_END } },
            { taxReturnNoteDate: { gte: RANGE_START, lte: RANGE_END } },
          ],
        },
      }),
    )
    expect(mocks.prismaMock.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          journal: expect.objectContaining({
            transactionDate: { gte: RANGE_START, lte: RANGE_END },
          }),
        }),
      }),
    )
    // period null (tanpa tanggal terbukti) tetap dimuat, bukan dibuang DB.
    expect(mocks.prismaMock.taxPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [{ period: null }, { period: { gte: "2026-01", lte: "2026-01" } }],
        },
      }),
    )
  })

  it("keluaran ekuivalen filter in-memory lama untuk fixture campuran", async () => {
    const rows = await loadSptPeriodRowsForRange(RANGE)

    // Hanya masa 2026-01. Keluaran: kepala rantai TI 3 (220) + legacy SI 503 (275)
    // = 495 mixed. Masukan: TI 5 credited (88) + legacy bill 604 (198) = 286 mixed;
    // bill 603 ternaungi TI 7 walau TI 7 tanpa creditPeriod. Retur: nota Jan (11).
    // Jurnal Jan: out 220 - in 88 = 132. Setor Jan ppn: 100.
    expect(rows).toEqual([
      {
        period: "2026-01",
        outputVat: 495,
        returnVat: 11,
        inputVat: 286,
        net: 198,
        kurangBayar: true,
        source: "mixed",
        journalLiability: 132,
        journalVsSptDiff: -66,
        paid: 100,
        balance: 98,
        overpaid: false,
      },
    ])
  })

  it("putaran 55: bill covered oleh TaxInvoice dibuang dari legacy walau TI luar rentang tanggal", async () => {
    // Bill 606 (Jan, tax>0, nomor valid) tertaut TI 8 (creditPeriod Mar,
    // status credited) -> DB boleh membuang TI 8 untuk rentang Jan, tetapi
    // cakupan legacy WAJIB tetap melihatnya; bila tidak, bill 606 dihitung
    // legacy di Jan walau sudah dikreditkan resmi di Mar (dobel masukan).
    TAX_INVOICES.push(
      { id: 8, direction: "in", taxPeriod: "2026-03", creditPeriod: "2026-03", creditStatus: "credited", dpp: 1500, taxAmount: 165, djpStatus: "approved", creditablePercent: 100, salesInvoiceId: null, vendorBillId: 606, replacesId: null },
    )
    VENDOR_BILLS.push(
      { id: 606, date: D(2026, 1, 25), subtotal: 1500, discountAmount: 0, tax: 165, taxInvoiceNumber: "010.000-26.00000006", status: "posted", deletedAt: null },
    )
    try {
      const rows = await loadSptPeriodRowsForRange(RANGE)
      // Jan tak berubah dari ekspektasi ekuivalensi: tak ada +165 dari bill 606.
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ period: "2026-01", inputVat: 286, net: 198, paid: 100, balance: 98 })
    } finally {
      TAX_INVOICES.pop()
      VENDOR_BILLS.pop()
    }
  })

  it("tanpa range: query tanpa filter periode (perilaku lama persis)", async () => {
    const rows = await loadSptPeriodRows()

    expect(mocks.prismaMock.taxInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    )
    // Tanpa rentang tidak ada query coverage terpisah (barisan utama utuh).
    expect(mocks.prismaMock.taxInvoice.findMany).not.toHaveBeenCalledWith({
      select: { salesInvoiceId: true, vendorBillId: true },
    })
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["posted", "partial", "paid"] }, deletedAt: null, taxAmount: { gt: 0 } },
      }),
    )
    expect(mocks.prismaMock.salesReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "completed" } }),
    )
    expect(mocks.prismaMock.taxPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    )
    // Semua masa tampil: Des 2025 (legacy SI 504), Jan, Feb (TI 4 + retur nota Feb),
    // Mar (TI 6 credited — bill 602 ternaungi, bukan legacy).
    expect(rows.map((r) => r.period)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03"])
    const feb = rows.find((r) => r.period === "2026-02")
    expect(feb).toMatchObject({ outputVat: 550, returnVat: 22, paid: 999 })
  })
})
