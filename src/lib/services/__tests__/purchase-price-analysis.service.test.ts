import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for the multi-source purchase price analysis (PRD PUR-08 / REP-10):
// comparison must be based on the effective landed unit cost (from posted goods
// receipts), NOT the PO listing price, and must surface the cheapest source and
// the landed-vs-listing uplift.

const grFindManyMock = vi.fn()
const poItemFindManyMock = vi.fn()
const itemFindManyMock = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    goodsReceipt: { findMany: (...a: unknown[]) => grFindManyMock(...a) },
    purchaseOrderItem: { findMany: (...a: unknown[]) => poItemFindManyMock(...a) },
    item: { findMany: (...a: unknown[]) => itemFindManyMock(...a) },
  },
}))

import { buildPurchasePriceAnalysis } from "../purchase-price-analysis.service"

function receipt(
  id: number,
  date: Date,
  vendorId: number | null,
  vendorName: string,
  lines: { itemId: number; qty: number; unitCost: number }[],
  purchaseOrderId = 500 + id,
) {
  return {
    id,
    date,
    purchaseOrderId,
    purchaseOrder: { vendorId, vendor: vendorId ? { name: vendorName } : null },
    items: lines,
  }
}

beforeEach(() => {
  grFindManyMock.mockReset()
  poItemFindManyMock.mockReset()
  itemFindManyMock.mockReset()
  poItemFindManyMock.mockResolvedValue([])
  itemFindManyMock.mockResolvedValue([])
})

describe("buildPurchasePriceAnalysis", () => {
  it("returns nothing when there are no receipts", async () => {
    grFindManyMock.mockResolvedValue([])
    const res = await buildPurchasePriceAnalysis({ startDate: new Date(2026, 0, 1), endDate: new Date() })
    expect(res.rows).toEqual([])
    expect(res.bestByItem).toEqual([])
  })

  it("groups by (item, vendor) and computes a qty-weighted landed unit cost", async () => {
    grFindManyMock.mockResolvedValue([
      receipt(1, new Date(2026, 0, 5), 100, "Toko A", [{ itemId: 20, qty: 10, unitCost: 100 }]),
      receipt(2, new Date(2026, 0, 20), 100, "Toko A", [{ itemId: 20, qty: 30, unitCost: 120 }]),
    ])
    itemFindManyMock.mockResolvedValue([{ id: 20, sku: "SKU-20", name: "Barang", unitOfMeasure: "PCS" }])

    const res = await buildPurchasePriceAnalysis({ startDate: new Date(2026, 0, 1), endDate: new Date() })

    expect(res.rows).toHaveLength(1)
    const row = res.rows[0]
    expect(row.vendorName).toBe("Toko A")
    expect(row.receipts).toBe(2)
    expect(row.totalQty).toBe(40)
    // (10*100 + 30*120) / 40 = 4600/40 = 115
    expect(row.avgLandedUnitCost).toBe(115)
    expect(row.minLandedUnitCost).toBe(100)
    expect(row.maxLandedUnitCost).toBe(120)
  })

  it("query listing PO dibatasi pasangan (item, vendor) grup receipt", async () => {
    grFindManyMock.mockResolvedValue([
      receipt(1, new Date(2026, 0, 5), 100, "Toko A", [{ itemId: 20, qty: 10, unitCost: 100 }]),
      receipt(2, new Date(2026, 0, 6), 200, "Toko B", [{ itemId: 21, qty: 5, unitCost: 200 }]),
    ])
    itemFindManyMock.mockResolvedValue([
      { id: 20, sku: "SKU-20", name: "Barang", unitOfMeasure: "PCS" },
      { id: 21, sku: "SKU-21", name: "Barang 2", unitOfMeasure: "PCS" },
    ])

    await buildPurchasePriceAnalysis({ startDate: new Date(2026, 0, 1), endDate: new Date() })

    expect(poItemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          purchaseOrderId: { in: [501, 502] },
          OR: [
            { itemId: 20, purchaseOrder: { vendorId: 100 } },
            { itemId: 21, purchaseOrder: { vendorId: 200 } },
          ],
        },
      }),
    )
  })

  it("putaran 41: avgListingUnitPrice tertimbang qty baris PO, bukan rata-rata per baris", async () => {
    grFindManyMock.mockResolvedValue([
      receipt(1, new Date(2026, 0, 5), 100, "Toko A", [{ itemId: 20, qty: 100, unitCost: 130 }]),
    ])
    itemFindManyMock.mockResolvedValue([{ id: 20, sku: "SKU-20", name: "Barang", unitOfMeasure: "PCS" }])
    poItemFindManyMock.mockResolvedValue([
      { itemId: 20, qty: 100, unitPrice: 120, purchaseOrderId: 501, purchaseOrder: { vendorId: 100 } },
      { itemId: 20, qty: 1, unitPrice: 60, purchaseOrderId: 501, purchaseOrder: { vendorId: 100 } },
    ])

    const res = await buildPurchasePriceAnalysis({ startDate: new Date(2026, 0, 1), endDate: new Date() })

    // Tertimbang: (100*120 + 1*60)/101 = 119.41. Rata-rata polos lama = 90.
    expect(res.rows[0].avgListingUnitPrice).toBe(119.41)
    expect(res.rows[0].landedUplift).toBe(10.59)
  })

  it("putaran 41: query listing menyaring purchaseOrderId ke PO receipt terpilih", async () => {
    grFindManyMock.mockResolvedValue([
      receipt(3, new Date(2026, 0, 7), 100, "Toko A", [{ itemId: 20, qty: 10, unitCost: 100 }], 777),
    ])
    itemFindManyMock.mockResolvedValue([{ id: 20, sku: "SKU-20", name: "Barang", unitOfMeasure: "PCS" }])

    await buildPurchasePriceAnalysis({ startDate: new Date(2026, 0, 1), endDate: new Date() })

    expect(poItemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ purchaseOrderId: { in: [777] } }),
        select: expect.objectContaining({ qty: true }),
      }),
    )
  })

  it("separates vendors and picks the cheapest by landed cost, not listing price", async () => {
    grFindManyMock.mockResolvedValue([
      // Vendor 100: listing was cheap (90) but landed is high (115).
      receipt(1, new Date(2026, 0, 5), 100, "Toko Mahal", [{ itemId: 20, qty: 10, unitCost: 115 }]),
      // Vendor 200: listing higher (110) but landed is cheaper (95).
      receipt(2, new Date(2026, 0, 6), 200, "Toko Murah", [{ itemId: 20, qty: 10, unitCost: 95 }]),
    ])
    itemFindManyMock.mockResolvedValue([{ id: 20, sku: "SKU-20", name: "Barang", unitOfMeasure: "PCS" }])
    poItemFindManyMock.mockResolvedValue([
      { itemId: 20, qty: 10, unitPrice: 90, purchaseOrderId: 501, purchaseOrder: { vendorId: 100 } },
      { itemId: 20, qty: 10, unitPrice: 110, purchaseOrderId: 502, purchaseOrder: { vendorId: 200 } },
    ])

    const res = await buildPurchasePriceAnalysis({ startDate: new Date(2026, 0, 1), endDate: new Date() })

    expect(res.rows).toHaveLength(2)
    // rows are sorted by landed cost ascending within the same sku
    expect(res.rows[0].vendorName).toBe("Toko Murah")
    expect(res.rows[0].avgLandedUnitCost).toBe(95)
    expect(res.rows[0].avgListingUnitPrice).toBe(110)
    // The cheap-landed vendor has a negative uplift (saving vs listing).
    expect(res.rows[0].landedUplift).toBe(-15)
    expect(res.rows[1].landedUplift).toBe(25)

    // The recommendation must pick Toko Murah despite its higher listing price.
    expect(res.bestByItem).toHaveLength(1)
    expect(res.bestByItem[0].vendorName).toBe("Toko Murah")
    expect(res.bestByItem[0].avgLandedUnitCost).toBe(95)
    // saving vs the worst source (115) = 20
    expect(res.bestByItem[0].savingVsWorst).toBe(20)
  })

  it("does not recommend when an item has only a single source", async () => {
    grFindManyMock.mockResolvedValue([
      receipt(1, new Date(2026, 0, 5), 100, "Toko A", [{ itemId: 20, qty: 10, unitCost: 100 }]),
    ])
    itemFindManyMock.mockResolvedValue([{ id: 20, sku: "SKU-20", name: "Barang", unitOfMeasure: "PCS" }])

    const res = await buildPurchasePriceAnalysis({ startDate: new Date(2026, 0, 1), endDate: new Date() })

    expect(res.rows).toHaveLength(1)
    expect(res.bestByItem).toEqual([])
  })
})
