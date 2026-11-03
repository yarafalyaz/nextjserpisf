import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regresi putaran 18: pengurang masa retur Faktur PPN dinilai pada masa
 * efektif nota retur (taxReturnNoteDate ?? tanggal retur), konsisten
 * read-model SPT — bukan tanggal retur mentah.
 */

const mocks = vi.hoisted(() => ({
  salesInvoice: { findMany: vi.fn() },
  vendorBill: { findMany: vi.fn() },
  salesReturn: { findMany: vi.fn() },
  purchaseReturn: { findMany: vi.fn() },
  taxInvoice: { findMany: vi.fn() },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks }))

import { loadVatInvoices } from "../vat-invoices-data"

const period = { start: new Date("2026-02-01T00:00:00.000Z"), end: new Date("2026-02-28T23:59:59.999Z") }

function ret(documentNo: string, date: string, note: string | null, vat: number) {
  return {
    documentNo,
    date: new Date(date),
    taxReturnNoteDate: note ? new Date(note) : null,
    salesInvoiceId: 9,
    salesInvoice: {
      documentNo: "INV-9",
      subtotal: 10_000_000,
      discount: 0,
      taxAmount: 1_100_000,
      customer: { name: "PT X" },
    },
    items: [{ qty: 1, price: 10_000_000, returnDpp: 10_000_000, returnVat: vat }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.salesInvoice.findMany.mockResolvedValue([])
  mocks.vendorBill.findMany.mockResolvedValue([])
  mocks.purchaseReturn.findMany.mockResolvedValue([])
  mocks.taxInvoice.findMany.mockResolvedValue([])
})

describe("loadVatInvoices return deduction period (round 18)", () => {
  it("retur 31 Jan nota 2 Feb menjadi pengurang Februari, bukan Januari", async () => {
    mocks.salesReturn.findMany.mockResolvedValue([
      ret("RET-1", "2026-01-31T00:00:00.000Z", "2026-02-02T00:00:00.000Z", 1_100_000),
    ])
    const feb = await loadVatInvoices(period)
    expect(feb.report.returnDeduction.count).toBe(1)
    expect(feb.report.returnDeduction.vat).toBe(1_100_000)

    const jan = await loadVatInvoices({
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2026-01-31T23:59:59.999Z"),
    })
    expect(jan.report.returnDeduction.count).toBe(0)
  })

  it("retur tanpa nota memakai tanggal retur sebagai masa efektif", async () => {
    mocks.salesReturn.findMany.mockResolvedValue([
      ret("RET-2", "2026-02-10T00:00:00.000Z", null, 550_000),
    ])
    const feb = await loadVatInvoices(period)
    expect(feb.report.returnDeduction.count).toBe(1)
    expect(feb.report.returnDeduction.vat).toBe(550_000)
  })

  it("regression round 18: bill tanpa nomor faktur pajak valid tampil PPN masukan 0", async () => {
    mocks.vendorBill.findMany.mockResolvedValue([
      {
        id: 5,
        documentNo: "BILL-5",
        taxInvoiceNumber: null,
        date: new Date("2026-02-10T00:00:00.000Z"),
        subtotal: 100_000_000,
        discountAmount: 0,
        tax: 11_000_000,
        grandTotal: 111_000_000,
        vendor: { name: "PT Vendor", npwp: "01.234" },
        vendorId: 3,
      },
      {
        id: 6,
        documentNo: "BILL-6",
        taxInvoiceNumber: "010.006-26.00000001",
        date: new Date("2026-02-11T00:00:00.000Z"),
        subtotal: 10_000_000,
        discountAmount: 0,
        tax: 1_100_000,
        grandTotal: 11_100_000,
        vendor: { name: "PT Vendor", npwp: "01.234" },
        vendorId: 3,
      },
    ])
    const feb = await loadVatInvoices(period)
    expect(feb.report.input.vat).toBe(1_100_000)
    expect(feb.report.input.count).toBe(2)
    // Putaran 99: kolom rekonsiliasi — total grup = Σ(DPP + PPN tampil).
    // BILL-5 (PPN ditolkan): 100jt + 0; BILL-6: 10jt + 1,1jt.
    expect(feb.report.input.dpp).toBe(110_000_000)
    expect(feb.report.input.total).toBe(111_100_000)
    expect(feb.report.input.total).toBe(feb.report.input.dpp + feb.report.input.vat)
  })

  it("query retur mengambil kandidat dari tanggal retur ATAU tanggal nota", async () => {
    mocks.salesReturn.findMany.mockResolvedValue([])
    await loadVatInvoices(period)
    const where = mocks.salesReturn.findMany.mock.calls[0][0].where
    expect(where.OR).toHaveLength(2)
    expect(where.OR[1]).toHaveProperty("taxReturnNoteDate")
  })
})
