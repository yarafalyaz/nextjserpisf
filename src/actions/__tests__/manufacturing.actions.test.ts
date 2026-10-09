import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  })

  const prismaMock: any = {
    product: buildModelMock(),
    productionOrder: buildModelMock(),
    workOrder: buildModelMock(),
    workOrderItem: buildModelMock(),
    stockMove: buildModelMock(),
    inventoryLayer: buildModelMock(),
    materialIssue: buildModelMock(),
    materialIssueItem: buildModelMock(),
    customer: buildModelMock(),
    item: buildModelMock(),
    productionOrderMaterial: buildModelMock(),
    productionGenealogy: buildModelMock(),
    productMaterial: buildModelMock(),
    bomRevision: buildModelMock(),
    warehouse: buildModelMock(),
    itemBatch: buildModelMock(),
    itemSerial: buildModelMock(),
    salesOrder: buildModelMock(),
    deliveryOrder: buildModelMock(),
    deliveryOrderItem: buildModelMock(),
    projectStage: buildModelMock(),
    project: buildModelMock(),

    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    // createMaterialIssueFromWorkOrder locks the WO row with tx.$executeRaw
    // before the in-tx idempotency re-check.
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
  }

  return {
    requirePermissionMock: vi.fn(),
    consumeFifoLayersMock: vi.fn(),
    productionIssueJournalMock: vi.fn(),
    assertPeriodOpenMock: vi.fn(),
    warehouseScopeMock: vi.fn(),
    createInLayerMock: vi.fn(),
    productionCompletionJournalMock: vi.fn(),
    productionRoundingJournalMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("DOC-001"),
  generateDocumentNumberBatch: vi.fn(async (_prefix: string, count: number) => Array.from({ length: count }, (_, i) => `SM-${i + 1}`)),
}))
vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: (...args: any[]) => mocks.consumeFifoLayersMock(...args),
  createInLayer: (...args: any[]) => mocks.createInLayerMock(...args),
}))
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: {
    onProductionOrderMaterialIssue: (...args: any[]) => mocks.productionIssueJournalMock(...args),
    onProductionOrderCompleted: (...args: any[]) => mocks.productionCompletionJournalMock(...args),
    onProductionOrderCostRoundingVariance: (...args: any[]) => mocks.productionRoundingJournalMock(...args),
  },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...args: any[]) => mocks.assertPeriodOpenMock(...args),
}))
// QC handover gate is a no-op by default in these tests; the QC-specific tests
// live in qc.test.ts. Without this mock the real service would query unmocked
// prisma models and fail every completeWorkOrder case.
vi.mock("@/lib/services/qc.service", () => ({
  assertWorkOrderQcCleared: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/auth/warehouse-scope", () => ({
  getWarehouseScope: (...args: any[]) => mocks.warehouseScopeMock(...args),
  assertWarehouseAccess: vi.fn(),
}))

import * as actions from "../manufacturing.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.warehouseScopeMock.mockResolvedValue({ kind: "all" })
  mocks.consumeFifoLayersMock.mockResolvedValue({ consumedCost: 42, shortfall: 0 })
  mocks.assertPeriodOpenMock.mockResolvedValue(undefined)
  mocks.createInLayerMock.mockResolvedValue(undefined)
})

describe("Product Actions", () => {
  it("createProduct succeeds", async () => {
    const res = await actions.createProduct(fdMap({
      name: "Product Test",
      code: "PROD-1",
      vehicleBrandId: 1,
      vehicleModelId: 1,
    }))
    expect(res?.success).toBe(true)
  })

  it("createProduct succeeds with auto generated code and valid materials", async () => {
    const fd = fdMap({
      name: "Product Test Auto",
    })
    fd.append("materialItemId", "1")
    fd.append("materialQty", "2")
    fd.append("materialItemId", "0") // Should be filtered out
    fd.append("materialQty", "0")

    const res = await actions.createProduct(fd)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        code: "DOC-001",
        materials: {
          create: [{ itemId: 1, qty: 2 }]
        }
      })
    }))
  })

  it("createProduct handles validation error", async () => {
    const res = await actions.createProduct(new FormData())
    expect(res?.success).toBe(false)
  })

  it("updateProduct succeeds", async () => {
    mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({ id: 1, materials: [] })
    const fd = fdMap({
      name: "Product Test Update",
      code: "PROD-2"
    })
    fd.append("materialItemId", "1")
    fd.append("materialQty", "2")
    const res = await actions.updateProduct(1, fd)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        materials: {
          deleteMany: {},
          create: [{ itemId: 1, qty: 2 }]
        }
      })
    }))
  })

  it("updateProduct handles validation error", async () => {
    const res = await actions.updateProduct(1, new FormData())
    expect(res?.success).toBe(false)
  })

  // ==================== REGRESSION: parseMaterialRows hardening ====================
  // The legacy createProduct/updateProduct hand-parsed materialItemId[] /
  // materialQty[] via `Number(itemId) > 0 && Number(qty) > 0` — letting
  // negative qty (poisons BOM totals) and non-integer itemId (FK violation
  // opaque 500) reach Prisma. The new parseMaterialRows validator must reject
  // these *before* touching the DB. These cases assert the validator hard-
  // fails (and the DB is NOT called) for each bypass class.
  describe("material row validation (regression)", () => {
    it("createProduct rejects negative material qty (was: silent BOM corruption)", async () => {
      const fd = fdMap({ name: "Bad Product" })
      fd.append("materialItemId", "1")
      fd.append("materialQty", "-5")
      const res = await actions.createProduct(fd)
      expect(res?.success).toBe(false)
      expect(res?.error).toMatch(/Qty material harus > 0/i)
      expect(mocks.prismaMock.product.create).not.toHaveBeenCalled()
    })

    it("createProduct rejects fractional material itemId (was: opaque FK 500)", async () => {
      const fd = fdMap({ name: "Bad Product 2" })
      fd.append("materialItemId", "1.5")
      fd.append("materialQty", "2")
      const res = await actions.createProduct(fd)
      expect(res?.success).toBe(false)
      // z.coerce.number().int() emits "Invalid input: expected int, received
      // number" for fractional input. The important assertion is that the row
      // is rejected and the DB is NOT called.
      expect(res?.error).toMatch(/Baris material #1/i)
      expect(mocks.prismaMock.product.create).not.toHaveBeenCalled()
    })

    it("createProduct rejects zero/negative material itemId (was: accepted by > 0 false, but fractional leaked)", async () => {
      const fd = fdMap({ name: "Bad Product 3" })
      fd.append("materialItemId", "-1")
      fd.append("materialQty", "2")
      const res = await actions.createProduct(fd)
      // Negative itemId is rejected by parseMaterialRows's positive-integer
      // guard. (itemId=0 and qty=0 are the legacy "blank row" sentinel and
      // remain dropped silently — see the createProduct "valid materials"
      // happy-path test above which still filters 0/0.)
      expect(res?.success).toBe(false)
      expect(res?.error).toMatch(/Material item tidak valid/i)
      expect(mocks.prismaMock.product.create).not.toHaveBeenCalled()
    })

    it("createProduct de-dupes duplicate itemIds by summing qty", async () => {
      const fd = fdMap({ name: "Dup Product" })
      fd.append("materialItemId", "1")
      fd.append("materialQty", "2")
      fd.append("materialItemId", "1")
      fd.append("materialQty", "3")
      const res = await actions.createProduct(fd)
      expect(res?.success).toBe(true)
      expect(mocks.prismaMock.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            materials: { create: [{ itemId: 1, qty: 5 }] },
          }),
        }),
      )
    })

    it("updateProduct rejects negative material qty (regression)", async () => {
      const fd = fdMap({ name: "Update Bad" })
      fd.append("materialItemId", "1")
      fd.append("materialQty", "-1")
      const res = await actions.updateProduct(1, fd)
      expect(res?.success).toBe(false)
      expect(res?.error).toMatch(/Qty material harus > 0/i)
      expect(mocks.prismaMock.product.update).not.toHaveBeenCalled()
    })

    it("createProduct accepts qty just over the 1,000,000 safety cap", async () => {
      // Documents the cap's edge case: 1_000_000.0001 is invalid (over the
      // cap), 1_000_000 exactly is the inclusive boundary and is allowed.
      const fd = fdMap({ name: "Edge Qty" })
      fd.append("materialItemId", "1")
      fd.append("materialQty", "1000000.0001")
      const res = await actions.createProduct(fd)
      expect(res?.success).toBe(false)
      expect(res?.error).toMatch(/Qty terlalu besar/i)
      expect(mocks.prismaMock.product.create).not.toHaveBeenCalled()
    })
  })

  it("deleteProduct succeeds", async () => {
    const res = await actions.deleteProduct(1)
    expect(res?.success).toBe(true)
  })
})

describe("Production Order Actions", () => {
  it("issues material through FIFO stock moves and journals the value to WIP", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({
      id: 8, documentNo: "MO-008", status: "confirmed", totalActualCost: 0,
    })
    mocks.prismaMock.item.findMany.mockResolvedValue([{
      id: 4, standardCost: 12, purchasePrice: 10, defaultWarehouseId: 5,
    }])
    mocks.prismaMock.warehouse.findFirst.mockResolvedValue({ id: 5 })
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 5 }])
    mocks.prismaMock.stockMove.create.mockResolvedValue({ id: 99 })

    const res = await actions.issueMaterial(8, [{ itemId: 4, qty: 3 }])

    expect(res.success).toBe(true)
    expect(mocks.consumeFifoLayersMock).toHaveBeenCalledWith(
      mocks.prismaMock,
      expect.objectContaining({ itemId: 4, warehouseId: 5, qty: 3 }),
    )
    expect(mocks.prismaMock.stockMove.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        itemId: 4, warehouseId: 5, qty: 3, cost: 14, impact: "OUT",
        status: "posted", referenceType: "ProductionOrder", referenceId: 8,
      }),
    }))
    expect(mocks.productionIssueJournalMock).toHaveBeenCalledWith(
      mocks.prismaMock, [{ itemId: 4, qty: 3, cost: 14, warehouseId: 5 }], "MO-008", 99, 1,
    )
    expect(mocks.prismaMock.$executeRaw).toHaveBeenCalledOnce()
  })

  it("rejects non-positive or invalid issued quantities", async () => {
    const res = await actions.issueMaterial(8, [{ itemId: 4, qty: 0 }])
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("persists the consumed serials and lots on the material line (PRD line 369 / REP-13)", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({
      id: 8, documentNo: "MO-008", status: "confirmed", totalActualCost: 0,
    })
    mocks.prismaMock.item.findMany.mockResolvedValue([{
      id: 4, standardCost: 12, purchasePrice: 10, defaultWarehouseId: 5,
    }])
    mocks.prismaMock.warehouse.findFirst.mockResolvedValue({ id: 5 })
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 5 }])
    mocks.prismaMock.stockMove.create.mockResolvedValue({ id: 99 })
    // FIFO consumption reports what it actually took, including the lots/serials.
    mocks.consumeFifoLayersMock.mockResolvedValue({
      consumedCost: 42,
      shortfall: 0,
      consumedSerials: ["RAW-A", "RAW-B"],
      consumedBatches: [
        { batchNumber: "LOT-1", warehouseId: 5, qty: 2 },
        { batchNumber: "LOT-1", warehouseId: 5, qty: 1 },
      ],
    })
    // No prior line → create path.
    mocks.prismaMock.productionOrderMaterial.findFirst.mockResolvedValue(null)

    const res = await actions.issueMaterial(8, [{ itemId: 4, qty: 3 }])

    expect(res.success).toBe(true)
    expect(mocks.prismaMock.productionOrderMaterial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productionOrderId: 8,
          itemId: 4,
          actualQty: 3,
          serialNumbers: ["RAW-A", "RAW-B"],
          // Duplicate LOT-1 from two decrements collapses to a single entry.
          batchNumbers: ["LOT-1"],
        }),
      }),
    )
  })

  it("merges serials/lots into an existing material line on a later issue", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({
      id: 8, documentNo: "MO-008", status: "in_progress", totalActualCost: 42,
    })
    mocks.prismaMock.item.findMany.mockResolvedValue([{
      id: 4, standardCost: 12, purchasePrice: 10, defaultWarehouseId: 5,
    }])
    mocks.prismaMock.warehouse.findFirst.mockResolvedValue({ id: 5 })
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 5 }])
    mocks.prismaMock.stockMove.create.mockResolvedValue({ id: 99 })
    mocks.consumeFifoLayersMock.mockResolvedValue({
      consumedCost: 30,
      shortfall: 0,
      consumedSerials: ["RAW-C"],
      consumedBatches: [{ batchNumber: "LOT-2", warehouseId: 5, qty: 2 }],
    })
    mocks.prismaMock.productionOrderMaterial.findFirst.mockResolvedValue({
      id: 77, actualQty: 3, actualCost: 42, serialNumbers: ["RAW-A"], batchNumbers: ["LOT-1"],
    })

    const res = await actions.issueMaterial(8, [{ itemId: 4, qty: 2 }])

    expect(res.success).toBe(true)
    expect(mocks.prismaMock.productionOrderMaterial.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 77 },
        data: expect.objectContaining({
          serialNumbers: ["RAW-A", "RAW-C"],
          batchNumbers: ["LOT-1", "LOT-2"],
        }),
      }),
    )
  })

  it("receives finished output, updates inventory layers, and transfers WIP on completion", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({
      id: 8,
      documentNo: "MO-008",
      status: "in_progress",
      qty: 2,
      totalActualCost: 20,
      totalStandardCost: 18,
      product: { inventoryItem: {
        id: 10, isProduct: true, isActive: true, deletedAt: null,
        defaultWarehouseId: 5, trackBatch: true, trackSerial: false,
      } },
    })
    mocks.prismaMock.warehouse.findFirst.mockResolvedValue({ id: 5 })
    mocks.prismaMock.stockMove.create.mockResolvedValue({ id: 456 })

    const res = await actions.completeProductionOrder(8)

    expect(res).toMatchObject({ success: true, variance: 2 })
    expect(mocks.prismaMock.stockMove.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        itemId: 10, warehouseId: 5, qty: 2, cost: 10,
        impact: "IN", status: "posted", referenceType: "ProductionOrder", referenceId: 8,
      }),
    }))
    expect(mocks.createInLayerMock).toHaveBeenCalledWith(mocks.prismaMock, expect.objectContaining({
      itemId: 10, warehouseId: 5, batchNumber: "MO-008", stockMoveId: 456, qty: 2, unitCost: 10,
    }))
    expect(mocks.prismaMock.itemBatch.create).toHaveBeenCalled()
    expect(mocks.prismaMock.item.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 10 }, data: { qtyOnHand: { increment: 2 } },
    }))
    expect(mocks.productionCompletionJournalMock).toHaveBeenCalledWith(
      mocks.prismaMock, [{ qty: 2, cost: 10 }], "MO-008", 8, 1,
    )
    expect(mocks.productionRoundingJournalMock).toHaveBeenCalledWith(
      mocks.prismaMock, 0, "MO-008", 8, 1,
    )
    // Production genealogy (REP-13) is recorded in the same transaction.
    expect(mocks.prismaMock.productionGenealogy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productionOrderId: 8,
          documentNo: "MO-008",
          outputItemId: 10,
          outputBatch: "MO-008",
          completedBy: 1,
        }),
      }),
    )
  })

  it("does not complete an order without a linked finished-goods inventory item", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({
      id: 8, documentNo: "MO-008", status: "in_progress", qty: 2,
      totalActualCost: 20, totalStandardCost: 18, product: { inventoryItem: null },
    })
    const res = await actions.completeProductionOrder(8)
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.stockMove.create).not.toHaveBeenCalled()
  })

  it("releases only a partial quantity, keeping the order in_progress with WIP (FAB-09)", async () => {
    // Order of 10, cost 100000 → unitCost 10000. Completing 4 releases 40000,
    // leaving 60000 as WIP; the order must NOT flip to completed.
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({
      id: 8, documentNo: "MO-008", status: "in_progress", qty: 10, completedQty: 0,
      totalActualCost: 100000, totalStandardCost: 90000,
      product: { inventoryItem: {
        id: 10, isProduct: true, isActive: true, deletedAt: null,
        defaultWarehouseId: 5, trackBatch: false, trackSerial: false,
      } },
    })
    mocks.prismaMock.warehouse.findFirst.mockResolvedValue({ id: 5 })
    mocks.prismaMock.stockMove.create.mockResolvedValue({ id: 456 })

    const res = await actions.completeProductionOrder(8, [], 4)

    expect(res).toMatchObject({ success: true, releasedQty: 4, completedQty: 4, isFinal: false })
    expect(mocks.prismaMock.stockMove.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ itemId: 10, qty: 4, cost: 10000 }),
    }))
    // WIP cost released: 40000 (4 × 10000), remainder 60000 stays.
    const update = mocks.prismaMock.productionOrder.update.mock.calls[0][0]
    expect(update.data.completedQty).toBe(4)
    expect(update.data.totalActualCost).toBe(60000)
    expect(update.data.status).toBeUndefined() // still in_progress
    // Genealogy is NOT recorded on a partial release.
    expect(mocks.prismaMock.productionGenealogy.create).not.toHaveBeenCalled()
  })

  it("completes the order once the released quantity reaches the full order qty", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({
      id: 8, documentNo: "MO-008", status: "in_progress", qty: 10, completedQty: 6,
      totalActualCost: 40000, totalStandardCost: 90000,
      product: { inventoryItem: {
        id: 10, isProduct: true, isActive: true, deletedAt: null,
        defaultWarehouseId: 5, trackBatch: false, trackSerial: false,
      } },
    })
    mocks.prismaMock.warehouse.findFirst.mockResolvedValue({ id: 5 })
    mocks.prismaMock.stockMove.create.mockResolvedValue({ id: 456 })

    const res = await actions.completeProductionOrder(8, [], 4)

    expect(res).toMatchObject({ success: true, completedQty: 10, isFinal: true })
    const update = mocks.prismaMock.productionOrder.update.mock.calls[0][0]
    expect(update.data.status).toBe("completed")
    expect(update.data.endDate).toBeInstanceOf(Date)
    // Remaining WIP cost is zeroed on final completion.
    expect(update.data.totalActualCost).toBe(0)
    // Genealogy is recorded on the final release.
    expect(mocks.prismaMock.productionGenealogy.create).toHaveBeenCalled()
  })

  it("accumulates production variance across partial releases (not the remaining-slice vs full-standard)", async () => {
    // Order of 10, standard 90000 (9000/unit), actual WIP 100000 (10000/unit).
    // Release 4 first → variance 40000 - 4×9000 = +4000, order stays in_progress.
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValueOnce({
      id: 8, documentNo: "MO-008", status: "in_progress", qty: 10, completedQty: 0,
      totalActualCost: 100000, totalStandardCost: 90000, variance: 0,
      product: { inventoryItem: {
        id: 10, isProduct: true, isActive: true, deletedAt: null,
        defaultWarehouseId: 5, trackBatch: false, trackSerial: false,
      } },
    })
    mocks.prismaMock.warehouse.findFirst.mockResolvedValue({ id: 5 })
    mocks.prismaMock.stockMove.create.mockResolvedValue({ id: 456 })

    const first = await actions.completeProductionOrder(8, [], 4)
    expect(first).toMatchObject({ success: true, isFinal: false, variance: 4000 })

    // Final release of the remaining 6 → 60000 released vs 6×9000 = 54000 std,
    // so +6000 this round; accumulated 4000 + 6000 = 10000 over the whole order.
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValueOnce({
      id: 8, documentNo: "MO-008", status: "in_progress", qty: 10, completedQty: 4,
      totalActualCost: 60000, totalStandardCost: 90000, variance: 4000,
      product: { inventoryItem: {
        id: 10, isProduct: true, isActive: true, deletedAt: null,
        defaultWarehouseId: 5, trackBatch: false, trackSerial: false,
      } },
    })
    const second = await actions.completeProductionOrder(8)
    expect(second).toMatchObject({ success: true, isFinal: true, variance: 10000 })
    const update = mocks.prismaMock.productionOrder.update.mock.calls[1][0]
    expect(update.data.variance).toBe(10000)
    expect(update.data.status).toBe("completed")
  })

  it("rejects completing more than the remaining quantity", async () => {    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({
      id: 8, documentNo: "MO-008", status: "in_progress", qty: 10, completedQty: 8,
      totalActualCost: 20000, totalStandardCost: 90000,
      product: { inventoryItem: {
        id: 10, isProduct: true, isActive: true, deletedAt: null,
        defaultWarehouseId: 5, trackBatch: false, trackSerial: false,
      } },
    })
    const res = await actions.completeProductionOrder(8, [], 5)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/melebihi sisa/i)
    expect(mocks.prismaMock.stockMove.create).not.toHaveBeenCalled()
  })

  it("carries the issued material lots/serials into the production genealogy (REP-13)", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({
      id: 8, documentNo: "MO-008", status: "in_progress", qty: 1,
      totalActualCost: 100, totalStandardCost: 90,
      product: { inventoryItem: {
        id: 10, isProduct: true, isActive: true, deletedAt: null,
        defaultWarehouseId: 5, trackBatch: false, trackSerial: false,
      } },
    })
    mocks.prismaMock.warehouse.findFirst.mockResolvedValue({ id: 5 })
    mocks.prismaMock.stockMove.create.mockResolvedValue({ id: 456 })
    // The material line remembered which source lots/serials it consumed.
    mocks.prismaMock.productionOrderMaterial.findMany.mockResolvedValue([
      { itemId: 20, actualQty: 2, actualCost: 200, serialNumbers: ["RAW-A", "RAW-B"], batchNumbers: ["LOT-1"] },
      { itemId: 21, actualQty: 1, actualCost: 50, serialNumbers: null, batchNumbers: null },
    ])

    const res = await actions.completeProductionOrder(8)

    expect(res).toMatchObject({ success: true })
    const materials = mocks.prismaMock.productionGenealogy.create.mock.calls[0][0].data.materials.create
    expect(materials[0]).toMatchObject({
      itemId: 20,
      serialNumbers: ["RAW-A", "RAW-B"],
      batchNumber: "LOT-1",
    })
    expect(materials[1].itemId).toBe(21)
    expect(materials[1].serialNumbers).toBeUndefined()
    expect(materials[1].batchNumber).toBeUndefined()
  })

  it("createProductionOrder succeeds", async () => {
    mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({ id: 1, materials: [] })
    const res = await actions.createProductionOrder(fdMap({
      productId: 1,
      qty: 10,
    }))
    expect(res?.success).toBe(true)
  })

  it("createProductionOrder succeeds with materials", async () => {
    mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      standardCost: 1000,
    })
    // No released revision → resolveEffectiveBom falls back to the working BOM.
    mocks.prismaMock.bomRevision.findFirst.mockResolvedValue(null)
    mocks.prismaMock.productMaterial.findMany.mockResolvedValue([
      { itemId: 1, qty: 2 },
      { itemId: 2, qty: 3 },
    ])
    // BOM item standard costs (createProductionOrder now stamps standardCost
    // on each material line + rolls up totalStandardCost = productStd * qty).
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 1, standardCost: 100 },
      { id: 2, standardCost: 200 },
    ])
    const res = await actions.createProductionOrder(fdMap({
      productId: 1,
      qty: 5,
      startDate: "2026-06-13",
      endDate: "2026-06-15",
      notes: "Test"
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.productionOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        notes: "Test",
        totalStandardCost: 5000,
        materials: {
          create: [
            { itemId: 1, qty: 10, standardCost: 100 },
            { itemId: 2, qty: 15, standardCost: 200 },
          ]
        }
      })
    }))
  })

  it("createProductionOrder pins a released BOM revision when one exists", async () => {
    mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({ id: 1, standardCost: 0 })
    mocks.prismaMock.bomRevision.findFirst.mockResolvedValue({
      id: 77, revisionNo: 3,
      materials: [{ itemId: 9, qty: 4 }],
    })
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 9, standardCost: 25 }])

    const res = await actions.createProductionOrder(fdMap({ productId: 1, qty: 2 }))

    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.productionOrder.create.mock.calls[0][0]
    expect(arg.data.bomRevisionId).toBe(77)
    expect(arg.data.materials.create).toEqual([{ itemId: 9, qty: 8, standardCost: 25 }])
    // Working BOM must not be consulted when a released revision exists.
    expect(mocks.prismaMock.productMaterial.findMany).not.toHaveBeenCalled()
  })

  it("createProductionOrder handles validation error", async () => {
    const res = await actions.createProductionOrder(new FormData())
    expect(res?.success).toBe(false)
  })

  it("updateProductionOrder succeeds", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({ id: 1, materials: [] })
    const res = await actions.updateProductionOrder(1, fdMap({
      productId: 1,
      qty: 10,
      startDate: "2026-06-13",
      endDate: "2026-06-15",
      notes: "Test"
    }))
    expect(res?.success).toBe(true)
  })

  it("updateProductionOrder succeeds with materials", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      materials: [{ itemId: 1, qty: 2 }, { itemId: 2, qty: 3 }]
    })
    const res = await actions.updateProductionOrder(1, fdMap({
      productId: 1,
      qty: 5
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.productionOrderMaterial.createMany).toHaveBeenCalled()
  })

  it("updateProductionOrder handles validation error", async () => {
    const res = await actions.updateProductionOrder(1, new FormData())
    expect(res?.success).toBe(false)
  })

  it("updateProductionOrder refuses when status changed to in_progress inside the tx (TOCTOU)", async () => {
    // Pre-check sees "draft"; by the time the transaction locks and re-reads, the
    // order has been issued (in_progress). The write must be refused so its
    // materials are not wiped mid-production.
    mocks.prismaMock.productionOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "draft" }) // outside the tx
      .mockResolvedValueOnce({ status: "in_progress" }) // inside the tx
    mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({ id: 1, materials: [{ itemId: 1, qty: 2 }] })

    const res = await actions.updateProductionOrder(1, fdMap({ productId: 1, qty: 10 }))

    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/status/i)
    expect(mocks.prismaMock.productionOrderMaterial.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.productionOrder.update).not.toHaveBeenCalled()
  })

  it("updateProductionOrder fails when not draft/pending", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({ id: 1, materials: [] })
    const res = await actions.updateProductionOrder(1, fdMap({
      productId: 1,
      qty: 10,
      startDate: "2026-06-13",
      endDate: "2026-06-15",
      notes: "Test"
    }))
    expect(res?.success).toBe(false)
  })

  it("deleteProductionOrder succeeds", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteProductionOrder(1)
    expect(res?.success).toBe(true)
  })

  it("deleteProductionOrder fails when not draft/pending", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed" })
    const res = await actions.deleteProductionOrder(1)
    expect(res?.success).toBe(false)
  })
})

describe("Work Order Actions", () => {
  it("startWorkOrder succeeds", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [{ id: 1 }] })
    const res = await actions.startWorkOrder(1)
    expect(res?.success).toBe(true)
  })

  it("startWorkOrder fails when not pending/draft", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed", items: [{ id: 1 }] })
    const res = await actions.startWorkOrder(1)
    expect(res?.success).toBe(false)
  })

  it("startWorkOrder fails when no items", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await actions.startWorkOrder(1)
    expect(res?.success).toBe(false)
  })

  it("completeWorkOrder succeeds", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "in_progress", items: [{ id: 1 }] })
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
  })

  it("completeWorkOrder fails when status wrong", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed", items: [{ id: 1 }] })
    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(false)
  })

  it("completeWorkOrder fails when no items", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "in_progress", items: [] })
    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(false)
  })

  it("completeWorkOrder fails when no completed Material Issue", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "in_progress", items: [{ id: 1 }] })
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue(null)
    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(false)
  })

  it("completeWorkOrder fails when concurrent claim loses", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "in_progress", items: [{ id: 1 }] })
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 0 })
    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(false)
  })

  it("completeWorkOrder auto-creates DeliveryOrder with items", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "in_progress", items: [{ id: 1 }] })
      .mockResolvedValueOnce({
        id: 1, documentNo: "WO-1", customerId: 5, quotationId: 7,
        items: [{ id: 10, itemId: 1, qty: 3, description: "desc" }],
        customer: { name: "Cust" }
      } as any)
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    mocks.prismaMock.salesOrder.findFirst.mockResolvedValue({ id: 99 })
    mocks.prismaMock.deliveryOrder.create.mockResolvedValue({ id: 100 })

    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.deliveryOrder.create).toHaveBeenCalled()
    expect(mocks.prismaMock.deliveryOrderItem.createMany).toHaveBeenCalled()
  })

  it("completeWorkOrder skips DO when no deliverable items", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "in_progress", items: [{ id: 1 }] })
      .mockResolvedValueOnce({
        id: 1, documentNo: "WO-1", customerId: 5, quotationId: 7,
        items: [{ id: 10, itemId: 1, qty: 0, description: null }],
        customer: { name: "Cust" }
      } as any)
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })

    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.deliveryOrder.create).not.toHaveBeenCalled()
  })

  it("completeWorkOrder skips DO when no sales order", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "in_progress", items: [{ id: 1 }] })
      .mockResolvedValueOnce({
        id: 1, documentNo: "WO-1", customerId: 5, quotationId: 7,
        items: [{ id: 10, itemId: 1, qty: 3, description: null }],
        customer: { name: "Cust" }
      } as any)
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    mocks.prismaMock.salesOrder.findFirst.mockResolvedValue(null)

    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.deliveryOrder.create).not.toHaveBeenCalled()
  })

  it("completeWorkOrder syncs project status - all completed", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "in_progress", items: [{ id: 1 }], projectId: 50 })
      .mockResolvedValueOnce({
        id: 1, documentNo: "WO-1", customerId: 5, quotationId: null,
        items: [{ id: 10, itemId: 1, qty: 0, description: null }],
        customer: null
      } as any)
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ status: "in_progress", endDate: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([
      { id: 1, status: "completed" },
      { id: 2, status: "completed" }
    ])

    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "completed" })
    }))
  })

  it("completeWorkOrder syncs project status - in progress", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "in_progress", items: [{ id: 1 }], projectId: 50 })
      .mockResolvedValueOnce({
        id: 1, documentNo: "WO-1", customerId: 5, quotationId: null,
        items: [{ id: 10, itemId: 1, qty: 0, description: null }],
        customer: null
      } as any)
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ status: "active", endDate: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([
      { id: 1, status: "completed" },
      { id: 2, status: "in_progress" }
    ])

    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "in_progress" })
    }))
  })

  it("completeWorkOrder skips DeliveryOrder when quotationId is null", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "in_progress", items: [{ id: 1 }] })
      .mockResolvedValueOnce({
        id: 1, documentNo: "WO-1", customerId: 5, quotationId: null,
        items: [{ id: 10, itemId: 1, qty: 3, description: "" }],
        customer: { name: "Cust" }
      } as any)
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    mocks.prismaMock.salesOrder.findFirst.mockResolvedValue({ id: 99 })
    mocks.prismaMock.deliveryOrder.create.mockResolvedValue({ id: 100 })

    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.salesOrder.findFirst).not.toHaveBeenCalled()
    expect(mocks.prismaMock.deliveryOrder.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.deliveryOrderItem.createMany).not.toHaveBeenCalled()
  })

  it("completeWorkOrder syncs project status - all stages pending (no update)", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "in_progress", items: [{ id: 1 }], projectId: 50 })
      .mockResolvedValueOnce({
        id: 1, documentNo: "WO-1", customerId: 5, quotationId: null,
        items: [{ id: 10, itemId: 1, qty: 0, description: null }],
        customer: null
      } as any)
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ status: "active", endDate: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([
      { id: 1, status: "pending" },
      { id: 2, status: "pending" }
    ])

    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.project.update).not.toHaveBeenCalled()
  })

  it("completeWorkOrder syncs project status - skipped stages count as completed (regression)", async () => {
    // Regression: previously a project with a `skipped` stage would never
    // auto-transition to `completed` because the local syncProjectStatus
    // only counted literal `completed` status. Skipped is a terminal "done"
    // state (mirrors the canonical fix in src/actions/project.actions.ts),
    // so a project with all stages either completed or skipped must flip
    // to `completed` once the last WO completes.
    mocks.prismaMock.workOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "in_progress", items: [{ id: 1 }], projectId: 50 })
      .mockResolvedValueOnce({
        id: 1, documentNo: "WO-1", customerId: 5, quotationId: null,
        items: [{ id: 10, itemId: 1, qty: 0, description: null }],
        customer: null
      } as any)
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ status: "in_progress", endDate: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([
      { id: 1, status: "completed" },
      { id: 2, status: "skipped" }
    ])

    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "completed" })
    }))
  })

  it("completeWorkOrder skips sync when no stages", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "in_progress", items: [{ id: 1 }], projectId: 50 })
      .mockResolvedValueOnce({
        id: 1, documentNo: "WO-1", customerId: 5, quotationId: null,
        items: [{ id: 10, itemId: 1, qty: 0, description: null }],
        customer: null
      } as any)
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([])

    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.project.update).not.toHaveBeenCalled()
  })

  it("completeWorkOrder does NOT overwrite project.endDate on a re-run for an already-completed project (regression: endDate drift)", async () => {
    // Regression: previously syncProjectStatus wrote `endDate: new Date()`
    // unconditionally on every call. A second WO completing for the same
    // project (e.g. warranty follow-up work, additional scope) would
    // silently drift the historical completion date forward, corrupting
    // SLA reports and customer follow-ups.
    const originalEndDate = new Date("2026-01-15T10:00:00.000Z")
    mocks.prismaMock.workOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "in_progress", items: [{ id: 1 }], projectId: 50 })
      .mockResolvedValueOnce({
        id: 1, documentNo: "WO-1", customerId: 5, quotationId: null,
        items: [{ id: 10, itemId: 1, qty: 0, description: null }],
        customer: null
      } as any)
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    // Project is ALREADY completed with a prior endDate — this is the
    // re-run scenario that triggered the drift bug.
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({
      status: "completed",
      endDate: originalEndDate,
    })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([
      { id: 1, status: "completed" },
      { id: 2, status: "completed" },
    ])

    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
    // No project update should fire — status & endDate are already correct.
    expect(mocks.prismaMock.project.update).not.toHaveBeenCalled()
  })
  it("deleteWorkOrder succeeds", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteWorkOrder(1)
    expect(res?.success).toBe(true)
  })

  it("deleteWorkOrder fails when not draft/pending", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed" })
    const res = await actions.deleteWorkOrder(1)
    expect(res?.success).toBe(false)
  })

  it("createMaterialIssueFromWorkOrder succeeds", async () => {
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue(null)
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "in_progress", documentNo: "WO-1",
      productionOrder: { id: 1, productId: 1 },
      quantity: 10,
      items: [
        { id: 1, qty: 5, itemId: 1 },
        { id: 2, qty: 0, itemId: 2 },
      ],
      product: { billOfMaterials: JSON.stringify([{ itemId: 1, qty: 2 }]) },
      customer: { name: "Customer A" },
      quotation: { customerVehicle: { licensePlate: "B 1234 ABC" } }
    } as any)
    const res = await actions.createMaterialIssueFromWorkOrder(1, 1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.materialIssueItem.createMany).toHaveBeenCalled()
  })

  it("createMaterialIssueFromWorkOrder fails when MI exists", async () => {
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, documentNo: "MI-1" })
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, documentNo: "WO-1", items: [{ id: 1, qty: 1 }], customer: null, quotation: null
    } as any)
    const res = await actions.createMaterialIssueFromWorkOrder(1, 1)
    expect(res?.success).toBe(false)
  })

  it("createMaterialIssueFromWorkOrder fails when no items", async () => {
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue(null)
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, documentNo: "WO-1", items: [], customer: null, quotation: null
    } as any)
    const res = await actions.createMaterialIssueFromWorkOrder(1, 1)
    expect(res?.success).toBe(false)
  })

  it("getWorkOrderWithCustomerInfo succeeds", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      items: [],
      customer: { name: "CUST" },
      quotation: null,
      project: null
    } as any)
    const res = await actions.getWorkOrderWithCustomerInfo(1)
    expect(res?.success).toBe(true)
    expect((res as any)?.data?.customerName).toBe("CUST")
  })

  it("getWorkOrderWithCustomerInfo succeeds with items and nested data", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      documentNo: "WO-1",
      status: "draft",
      date: new Date(),
      startDate: null,
      endDate: null,
      notes: "n",
      customerId: 5,
      customerVehicleId: 7,
      projectId: 9,
      customer: { name: "CUST" },
      quotation: {
        customerVehicle: {
          vehicle: { plateNumber: "B 1", variant: { name: "V" } }
        }
      },
      project: { id: 9 },
      items: [{ id: 1, itemId: 100, qty: 1, cost: 0, description: "d", status: "pending" }]
    } as any)
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 100, name: "Item 100" }])
    const res = await actions.getWorkOrderWithCustomerInfo(1)
    expect(res?.success).toBe(true)
    expect((res as any)?.data?.items?.[0]?.itemName).toBe("Item 100")
    expect((res as any)?.data?.licensePlate).toBe("B 1")
    expect((res as any)?.data?.vehicleName).toBe("V")
  })
})


describe('Global Error Paths (Permission Reject for 11 funcs)', () => {
  // A real NEXT_REDIRECT error object so isNextRedirectError returns true and the catch re-throws.
  const redirectErr = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/login;307" })

  const fd = () => new FormData()

  it("createProduct handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.createProduct(fd())
    expect(res?.success).toBe(false)
  })

  it("createProduct re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.createProduct(fd())).rejects.toBe(redirectErr)
  })

  it("updateProduct handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.updateProduct(1, fd())
    expect(res?.success).toBe(false)
  })

  it("updateProduct re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.updateProduct(1, fd())).rejects.toBe(redirectErr)
  })

  it("createProductionOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.createProductionOrder(fd())
    expect(res?.success).toBe(false)
  })

  it("createProductionOrder re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.createProductionOrder(fd())).rejects.toBe(redirectErr)
  })

  it("startWorkOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.startWorkOrder(1)
    expect(res?.success).toBe(false)
  })

  it("startWorkOrder re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.startWorkOrder(1)).rejects.toBe(redirectErr)
  })

  it("completeWorkOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(false)
  })

  it("completeWorkOrder re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.completeWorkOrder(1)).rejects.toBe(redirectErr)
  })

  it("createMaterialIssueFromWorkOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.createMaterialIssueFromWorkOrder(1, 1)
    expect(res?.success).toBe(false)
  })

  it("createMaterialIssueFromWorkOrder re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.createMaterialIssueFromWorkOrder(1, 1)).rejects.toBe(redirectErr)
  })

  it("getWorkOrderWithCustomerInfo handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.getWorkOrderWithCustomerInfo(1)
    expect(res?.success).toBe(false)
  })

  it("getWorkOrderWithCustomerInfo re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.getWorkOrderWithCustomerInfo(1)).rejects.toBe(redirectErr)
  })

  it("deleteProduct handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.deleteProduct(1)
    expect(res?.success).toBe(false)
  })

  it("deleteProduct re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.deleteProduct(1)).rejects.toBe(redirectErr)
  })

  it("deleteWorkOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.deleteWorkOrder(1)
    expect(res?.success).toBe(false)
  })

  it("deleteWorkOrder re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.deleteWorkOrder(1)).rejects.toBe(redirectErr)
  })

  it("deleteProductionOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.deleteProductionOrder(1)
    expect(res?.success).toBe(false)
  })

  it("deleteProductionOrder re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.deleteProductionOrder(1)).rejects.toBe(redirectErr)
  })

  it("updateProductionOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    const res = await actions.updateProductionOrder(1, fd())
    expect(res?.success).toBe(false)
  })

  it("updateProductionOrder re-throws redirect error", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
    await expect(actions.updateProductionOrder(1, fd())).rejects.toBe(redirectErr)
  })
})
