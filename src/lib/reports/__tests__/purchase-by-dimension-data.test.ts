import { describe, expect, it, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  prismaMock: {
    vendorBill: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadPurchasesByDimension } from "../purchase-by-dimension-data"

const PERIOD = { start: new Date("2026-10-01"), end: new Date("2026-10-31") }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.item.findMany.mockResolvedValue([])
  mocks.prismaMock.account.findMany.mockResolvedValue([])
})

describe("loadPurchasesByDimension — dasar DPP baris tagihan", () => {
  it("subtotal baris sudah neto diskon; diskon tidak dipotong dua kali", async () => {
    // computeBillLineAmounts: gross 300.000, diskon 10% 30.000, subtotal 270.000,
    // PPN 11% 29.700. DPP yang dilaporkan harus 270.000, bukan 240.000.
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([
      {
        id: 1,
        documentNo: "VB-001",
        vendorId: 7,
        vendor: { name: "PT Sumber" },
        items: [
          {
            itemId: null,
            description: "Bahan",
            subtotal: 270_000,
            discountAmount: 30_000,
            taxAmount: 29_700,
            accountId: null,
          },
        ],
      },
    ])

    const report = await loadPurchasesByDimension(PERIOD, "pemasok")

    expect(report.result.totals.dpp).toBe(270_000)
    expect(report.result.totals.tax).toBe(29_700)
    expect(report.result.totals.total).toBe(299_700)
    const row = report.result.table.rows.find((row) => row.kind === "data")
    expect(row?.kind === "data" ? row.cells : []).toEqual(["PT Sumber", "1", "270.000", "29.700", "299.700"])
  })

  it("baris diskon 100% tidak menghasilkan DPP negatif", async () => {
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([
      {
        id: 2,
        documentNo: "VB-002",
        vendorId: 8,
        vendor: { name: "PT Gratis" },
        items: [
          {
            itemId: null,
            description: "Sampel",
            subtotal: 0,
            discountAmount: 100_000,
            taxAmount: 0,
            accountId: null,
          },
        ],
      },
    ])

    const report = await loadPurchasesByDimension(PERIOD, "pemasok")

    expect(report.result.totals.dpp).toBe(0)
    expect(report.result.table.rows.some((row) => row.kind === "data")).toBe(false)
  })
})
