import { describe, expect, it } from "vitest"
import { buildBomRevisionImpact, buildBomRevisionDelta } from "@/lib/reports/bom-revision-impact"

describe("buildBomRevisionImpact (F-2026-10-20-41(a))", () => {
  it("hitung issued/outstanding per baris WO + PO terbuka neto sisa", () => {
    const r = buildBomRevisionImpact({
      workOrders: [
        {
          id: 1,
          documentNo: "WO-1",
          status: "in_progress",
          items: [
            { id: 11, itemId: 100, qty: 4, status: "in_progress" },
            { id: 12, itemId: 100, qty: 2, status: "pending" },
          ],
          issuedItems: [{ workOrderItemId: 11, itemId: 100, qty: 3 }],
        },
        {
          id: 2,
          documentNo: "WO-2",
          status: "completed",
          items: [{ id: 21, itemId: 200, qty: 1, status: "completed" }],
          issuedItems: [{ workOrderItemId: 21, itemId: 200, qty: 1 }],
        },
      ],
      productionOrderCount: 3,
      purchaseOrders: [
        {
          id: 5,
          documentNo: "PO-1",
          status: "partial_received",
          workOrderId: 1,
          items: [{ qty: 10, receivedQty: 4 }],
        },
        {
          id: 6,
          documentNo: "PO-2",
          status: "received",
          workOrderId: 1,
          items: [{ qty: 5, receivedQty: 5 }],
        },
      ],
    })
    expect(r.workOrders[0]).toMatchObject({ issuedQty: 3, outstandingQty: 3, issuedLineCount: 1 })
    expect(r.workOrders[1]).toMatchObject({ issuedQty: 1, outstandingQty: 0 })
    expect(r.productionOrderCount).toBe(3)
    expect(r.openPurchaseOrderCount).toBe(1)
    expect(r.openPurchaseQty).toBe(6)
    expect(r.activeWorkOrderCount).toBe(1)
    expect(r.issuedWorkOrderCount).toBe(2)
  })

  it("baris legacy tanpa workOrderItemId diatribusikan per itemId tanpa overstate", () => {
    const r = buildBomRevisionImpact({
      workOrders: [
        {
          id: 1,
          documentNo: "WO-1",
          status: "in_progress",
          items: [
            { id: 11, itemId: 100, qty: 2, status: "pending" },
            { id: 12, itemId: 100, qty: 2, status: "pending" },
          ],
          issuedItems: [{ workOrderItemId: null, itemId: 100, qty: 3 }],
        },
      ],
      productionOrderCount: 0,
      purchaseOrders: [],
    })
    expect(r.workOrders[0].outstandingQty).toBe(1)
    expect(r.workOrders[0].issuedLineCount).toBe(2)
  })

  it("revisi tanpa dokumen tertaut: semua nol", () => {
    const r = buildBomRevisionImpact({ workOrders: [], productionOrderCount: 0, purchaseOrders: [] })
    expect(r).toMatchObject({ openPurchaseQty: 0, activeWorkOrderCount: 0, issuedWorkOrderCount: 0 })
  })
})

describe("buildBomRevisionDelta (F-2026-10-22-068-S)", () => {
  it("genuinely-new: kebutuhan = qty-baru x planned - issued dokumen ini; cakupan dari stok", () => {
    const r = buildBomRevisionDelta({
      oldMaterials: [{ itemId: 1, qty: 2 }],
      newMaterials: [
        { itemId: 1, qty: 2 },
        { itemId: 2, qty: 3 },
      ],
      plannedQty: 10,
      issuedByItem: [{ itemId: 2, qty: 5 }],
      availableByItem: [{ itemId: 2, qty: 30 }],
    })
    expect(r.hasGenuinelyNew).toBe(true)
    expect(r.lines.find((l) => l.itemId === 2)).toMatchObject({
      oldQtyPerUnit: 0,
      newNeededQty: 25,
      coverage: "tercakup",
    })
    expect(r.lines.find((l) => l.itemId === 1)).toMatchObject({
      newNeededQty: 0,
      coverage: "tercakup",
    })
  })

  it("issued melebihi kebutuhan lama: kenaikan qty tetap genuinely perlu sisanya", () => {
    const r = buildBomRevisionDelta({
      oldMaterials: [{ itemId: 1, qty: 1 }],
      newMaterials: [{ itemId: 1, qty: 4 }],
      plannedQty: 10,
      issuedByItem: [{ itemId: 1, qty: 25 }],
      availableByItem: [{ itemId: 1, qty: 10 }],
    })
    // 4x10 - max(1x10, 25) = 15; stok 10 < 15 -> kurang
    expect(r.lines[0]).toMatchObject({ newNeededQty: 15, coverage: "kurang" })
    expect(r.hasGenuinelyNew).toBe(false)
  })

  it("tanpa data stok: baris genuinely-new perlu-tinjau (reservasi tak disentuh)", () => {
    const r = buildBomRevisionDelta({
      oldMaterials: [],
      newMaterials: [{ itemId: 9, qty: 1 }],
      plannedQty: 2,
      issuedByItem: [],
    })
    expect(r.lines[0]).toMatchObject({ newNeededQty: 2, coverage: "perlu-tinjau" })
  })
})
