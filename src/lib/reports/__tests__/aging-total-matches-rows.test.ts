import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Total laporan umur harus sama dengan jumlah baris yang TERCETAK. Dengan
 * format 0 desimal, dua baris sisa Rp1.000.000,50 tercetak "1.000.001" tiap
 * baris (jumlah 2.000.002) sementara total bucket dibulatkan dari 2.000.001.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: { salesInvoice: { findMany: vi.fn() }, vendorBill: { findMany: vi.fn() } },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/reports/return-credit", () => ({
  loadReturnCreditByInvoiceId: vi.fn(async () => new Map()),
}))

import { loadReceivablesAging } from "../aging-reports-data"

const AS_OF = new Date("2026-10-31T00:00:00Z")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
  mocks.prismaMock.vendorBill.findMany.mockResolvedValue([])
})

describe("laporan umur: total = jumlah baris yang tercetak", () => {
  it("sisa ber-sen tercetak hingga sen sehingga baris menjumlah ke total", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      {
        id: 1,
        customerId: 1,
        grandTotal: 1_000_000.5,
        paidAmount: 0,
        dueDate: new Date("2026-09-01T00:00:00Z"),
        customer: { name: "PT A" },
        documentNo: "INV-1",
        customDocumentNo: null,
      },
      {
        id: 2,
        customerId: 2,
        grandTotal: 1_000_000.5,
        paidAmount: 0,
        dueDate: new Date("2026-09-01T00:00:00Z"),
        customer: { name: "PT B" },
        documentNo: "INV-2",
        customDocumentNo: null,
      },
    ])

    const report = await loadReceivablesAging(AS_OF)
    const rows = report.table.rows.filter(
      (row) => row.kind === "data" && row.cells[4] !== "0" && row.cells[0] !== "31–60 Hari",
    )
    const bucket = report.table.rows.find((row) => row.kind === "data" && row.cells[0] === "31–60 Hari")
    const total = report.table.rows.find((row) => row.kind === "total")

    expect(rows.map((row) => (row.kind === "data" ? row.cells[4] : ""))).toEqual([
      "1.000.000,50",
      "1.000.000,50",
    ])
    // Total tepat 2.000.001 (bulat) tetap rupiah penuh; yang penting barisnya
    // kini memperlihatkan sen sehingga penjumlahan yang dibaca pembaca cocok
    // dengan total, bukan "1.000.001 + 1.000.001 vs 2.000.001".
    const printedTotal = bucket?.kind === "data" ? bucket.cells[4] : ""
    expect(printedTotal).toBe("2.000.001")
    expect(total?.kind === "total" ? total.cells : []).toEqual(["2.000.001"])
  })
})
