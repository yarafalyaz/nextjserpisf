import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

/**
 * Penjaga kueri loader laporan barang diterima sebagian: status PO
 * `partial_received` adalah populasi inti laporan ini (ditulis jalur
 * penerimaan: purchase.actions + goods-receipt.hook), jadi kueri loader
 * wajib memuatnya. Dulu daftar status loader tidak memuatnya (dan malah
 * memuat `verified`, status GoodsReceipt bukan PurchaseOrder), sehingga
 * PO diterima sebagian hilang total dari laporan walau barisnya bersisa.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    purchaseOrder: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadPurchaseOutstanding } from "../purchase-outstanding-data"

const dec = (v: number) => new Prisma.Decimal(v)
const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([])
  mocks.prismaMock.item.findMany.mockResolvedValue([])
})

describe("loadPurchaseOutstanding", () => {
  it("regresi putaran 48: kueri loader memuat status PO partial_received, bukan verified", async () => {
    await loadPurchaseOutstanding(period)

    const where = mocks.prismaMock.purchaseOrder.findMany.mock.calls[0][0].where
    expect(where.status.in).toContain("partial_received")
    expect(where.status.in).not.toContain("verified")
    expect(where.deletedAt).toBeNull()
  })

  it("PO partial_received dengan sisa penerimaan tampil di laporan", async () => {
    mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([
      {
        documentNo: "PO-0007",
        date: new Date("2026-10-05T00:00:00"),
        status: "partial_received",
        vendor: { name: "CV Sumber" },
        items: [{ itemId: 1, qty: dec(100), receivedQty: dec(40), unitPrice: dec(50_000) }],
      },
    ])
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 1, sku: "SKU-01", name: "Busi Iridium", unitOfMeasure: "PCS" },
    ])

    const { outstanding } = await loadPurchaseOutstanding(period)

    expect(outstanding.totals.orders).toBe(1)
    expect(outstanding.totals.partiallyReceived).toBe(1)
    expect(outstanding.totals.outstandingValue).toBe(60 * 50_000)
  })
})
