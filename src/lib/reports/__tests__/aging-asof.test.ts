import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Posisi aging per tanggal acuan: PDF periode lampau (registry memanggil
 * loader dengan period.end) tidak boleh memuat dokumen bertanggal SESUDAH
 * tanggal acuan — dokumen itu belum ada pada posisi yang dilaporkan.
 * Sisa tetap saldo kolom berjalan kini (batas sadar loader, lihat komentar
 * registry); yang dikunci di sini adalah himpunan dokumennya.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    salesInvoice: { findMany: vi.fn() },
    vendorBill: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/reports/return-credit", () => ({
  loadReturnCreditByInvoiceId: vi.fn(async () => new Map()),
}))

import {
  loadPayablesAging,
  loadPayablesTotal,
  loadReceivablesAging,
} from "../aging-reports-data"

const AS_OF = new Date("2026-10-31T23:59:59.999Z")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
  mocks.prismaMock.vendorBill.findMany.mockResolvedValue([])
})

describe("loader aging menyaring dokumen bertanggal <= asOf", () => {
  it("loadReceivablesAging mengirim date lte asOf", async () => {
    await loadReceivablesAging(AS_OF)
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { lte: AS_OF } }),
      }),
    )
  })

  it("loadPayablesAging mengirim date lte asOf", async () => {
    await loadPayablesAging(AS_OF)
    expect(mocks.prismaMock.vendorBill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { lte: AS_OF } }),
      }),
    )
  })

  it("loadPayablesTotal mengirim date lte asOf", async () => {
    await loadPayablesTotal(AS_OF)
    expect(mocks.prismaMock.vendorBill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { lte: AS_OF } }),
      }),
    )
  })

  it("baris faktur dalam posisi tetap tampil dengan sisa kanonis", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      {
        id: 1,
        documentNo: "INV-1",
        slug: "inv-1",
        date: new Date("2026-10-10"),
        dueDate: new Date("2026-10-20"),
        grandTotal: 1_000_000,
        paidAmount: 250_000,
        customer: { name: "PT Uji" },
      },
    ])
    const view = await loadReceivablesAging(AS_OF)
    const text = JSON.stringify(view.table.rows)
    expect(text).toContain("PT Uji")
    expect(text).toContain("750")
  })
})
