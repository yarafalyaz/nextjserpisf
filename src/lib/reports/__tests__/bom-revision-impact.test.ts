import { describe, expect, it } from "vitest"
import { buildBomRevisionImpact } from "@/lib/reports/bom-revision-impact"

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
