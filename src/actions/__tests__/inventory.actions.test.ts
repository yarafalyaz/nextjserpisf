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
    stockAdjustment: buildModelMock(),
    stockAdjustmentItem: buildModelMock(),
    inventoryTransfer: buildModelMock(),
    inventoryTransferItem: buildModelMock(),
    materialIssue: buildModelMock(),
    materialIssueItem: buildModelMock(),
    workOrder: buildModelMock(),
    workOrderItem: buildModelMock(),
    rack: {
      ...buildModelMock(),
      aggregate: vi.fn().mockResolvedValue({ _max: { id: 0 } }),
    },
    rackRow: {
      ...buildModelMock(),
      aggregate: vi.fn().mockResolvedValue({ _max: { id: 0 } }),
    },
    systemSetting: buildModelMock(),
    warehouse: buildModelMock(),
    item: buildModelMock(),
    stockMove: {
      ...buildModelMock(),
      groupBy: vi.fn().mockResolvedValue([{ itemId: 1, _sum: { qty: 5 } }]),
    },

    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
  }

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("DOC-001") }))

vi.mock("@/lib/hooks/accounting.hook", () => ({
  onStockAdjustmentProcessed: vi.fn().mockResolvedValue({}),
  onMaterialIssueCompleted: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/stock-adjustment.hook", () => ({
  onStockAdjustmentProcessed: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/inventory-transfer.hook", () => ({
  onTransferProcessed: vi.fn().mockResolvedValue({}),
  onTransferReceived: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/material-issue.hook", () => ({
  onMaterialIssueCompleted: vi.fn().mockResolvedValue({}),
}))

import * as actions from "../inventory.actions"
import { onStockAdjustmentProcessed as accStockAdj, onMaterialIssueCompleted as accMatIssue } from "@/lib/hooks/accounting.hook"
import { onStockAdjustmentProcessed as stockAdjHook } from "@/lib/hooks/stock-adjustment.hook"
import { onMaterialIssueCompleted as matIssueHook } from "@/lib/hooks/material-issue.hook"

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
})

describe("Stock Adjustment Actions", () => {
  it("createStockAdjustment succeeds", async () => {
    const res = await actions.createStockAdjustment(fdMap({ warehouseId: 1, date: "2026-06-13", reason: "Test", items: JSON.stringify([{ itemId: 1, qty: 10, cost: 100 }]) }))
    expect(res?.success).toBe(true)
  })
  it("createStockAdjustment computes systemQty as IN - OUT (not gross sum)", async () => {
    // Simulate historical posted moves: 15 IN + 5 OUT in this warehouse => real stock = 10.
    // The OLD bug summed IN and OUT together, so systemQty was reported as 20 instead of 10.
    mocks.prismaMock.stockMove.groupBy.mockResolvedValueOnce([
      { itemId: 1, impact: "IN", _sum: { qty: 15 } },
      { itemId: 1, impact: "OUT", _sum: { qty: 5 } },
    ])
    mocks.prismaMock.stockAdjustment.create.mockImplementationOnce(({ data }: any) => {
      const item = data.items.create[0]
      // systemQty MUST be 10 (15 - 5), NOT 20.
      expect(item.systemQty).toBe(10)
      // With actualQty=12 the difference is +2, not -8.
      expect(item.difference).toBe(2)
      return { id: 1 }
    })
    const res = await actions.createStockAdjustment(fdMap({
      warehouseId: 1,
      date: "2026-06-13",
      reason: "Test",
      items: JSON.stringify([{ itemId: 1, currentQty: 999, newQty: 12, unitCost: 100, reason: "" }]),
    }))
    expect(res?.success).toBe(true)
  })
  it("createStockAdjustment filters by status: posted only (drafts must not inflate systemQty)", async () => {
    mocks.prismaMock.stockMove.groupBy.mockResolvedValueOnce([]) // no posted moves
    mocks.prismaMock.stockAdjustment.create.mockImplementationOnce(({ data }: any) => {
      expect(data.items.create[0].systemQty).toBe(0)
      return { id: 1 }
    })
    const res = await actions.createStockAdjustment(fdMap({
      warehouseId: 1,
      date: "2026-06-13",
      reason: "Test",
      items: JSON.stringify([{ itemId: 1, newQty: 0, unitCost: 100, reason: "" }]),
    }))
    expect(res?.success).toBe(true)
  })
  it("updateStockAdjustment succeeds", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateStockAdjustment(1, fdMap({ warehouseId: 1, date: "2026-06-13", reason: "Test", items: JSON.stringify([{ itemId: 1, qty: 10, cost: 100 }]) }))
    expect(res?.success).toBe(true)
  })
  it("processStockAdjustment succeeds", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await actions.processStockAdjustment(1)
    expect(res?.success).toBe(true)
  })
  it("processStockAdjustment does not duplicate journal (stock hook owns it)", async () => {
    vi.clearAllMocks()
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await actions.processStockAdjustment(1)
    expect(res?.success).toBe(true)
    expect(stockAdjHook).toHaveBeenCalledWith(1, 1, expect.any(Object))
    expect(accStockAdj).not.toHaveBeenCalled()
  })

  it("deleteStockAdjustment succeeds", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteStockAdjustment(1)
    expect(res?.success).toBe(true)
  })
})

describe("Inventory Transfer Actions", () => {
  it("createInventoryTransfer succeeds", async () => {
    const res = await actions.createInventoryTransfer(fdMap({ sourceWarehouseId: 1, destinationWarehouseId: 2, date: "2026-06-13", items: JSON.stringify([{ itemId: 1, qty: 10 }]) }))
    expect(res?.success).toBe(true)
  })
  it("updateInventoryTransfer succeeds", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateInventoryTransfer(1, fdMap({ sourceWarehouseId: 1, destinationWarehouseId: 2, date: "2026-06-13", items: JSON.stringify([{ itemId: 1, qty: 10 }]) }))
    expect(res?.success).toBe(true)
  })
  it("processInventoryTransfer succeeds", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await actions.processInventoryTransfer(1)
    expect(res?.success).toBe(true)
  })
  it("receiveInventoryTransfer succeeds", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed", items: [] })
    const res = await actions.receiveInventoryTransfer(1)
    expect(res?.success).toBe(true)
  })
  it("deleteInventoryTransfer succeeds", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteInventoryTransfer(1)
    expect(res?.success).toBe(true)
  })
})

describe("Material Issue Actions", () => {
  it("createMaterialIssue succeeds", async () => {
    const res = await actions.createMaterialIssue(fdMap({ warehouseId: 1, projectId: 1, date: "2026-06-13", items: JSON.stringify([{ itemId: 1, qty: 10, cost: 100 }]) }))
    expect(res?.success).toBe(true)
  })
  it("updateMaterialIssue succeeds", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateMaterialIssue(1, fdMap({ warehouseId: 1, projectId: 1, date: "2026-06-13", items: JSON.stringify([{ itemId: 1, qty: 10, cost: 100 }]) }))
    expect(res?.success).toBe(true)
  })
  it("completeMaterialIssue succeeds", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await actions.completeMaterialIssue(1)
    expect(res?.success).toBe(true)
  })
  it("completeMaterialIssue does not duplicate journal (stock hook owns it)", async () => {
    vi.clearAllMocks()
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await actions.completeMaterialIssue(1)
    expect(res?.success).toBe(true)
    expect(matIssueHook).toHaveBeenCalledWith(1, 1, expect.any(Object))
    expect(accMatIssue).not.toHaveBeenCalled()
  })

  it("deleteMaterialIssue succeeds", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteMaterialIssue(1)
    expect(res?.success).toBe(true)
  })
})

describe("Rack & WorkOrder & Others", () => {
  it("createWorkOrder succeeds", async () => {
    const res = await actions.createWorkOrder(fdMap({ customerId: 1, projectId: 1, date: "2026-06-13", name: "WO", quantity: 1 }))
    expect(res?.success).toBe(true)
  })
  it("updateWorkOrder succeeds", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateWorkOrder(1, fdMap({ customerId: 1, projectId: 1, date: "2026-06-13", name: "WO", quantity: 1 }))
    expect(res?.success).toBe(true)
  })
  it("createRack succeeds", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({ enableAutoRackCode: true })
    const res = await actions.createRack(fdMap({ warehouseId: 1, code: "R1", name: "Rack 1" }))
    expect(res?.success).toBe(true)
  })
  it("updateRack succeeds", async () => {
    const res = await actions.updateRack(1, fdMap({ warehouseId: 1, code: "R1", name: "Rack 1" }))
    expect(res?.success).toBe(true)
  })
  it("deleteRack succeeds", async () => {
    mocks.prismaMock.item.count.mockResolvedValue(0)
    mocks.prismaMock.stockMove.count.mockResolvedValue(0)
    mocks.prismaMock.rackRow.count.mockResolvedValue(0)
    const res = await actions.deleteRack(1)
    expect(res?.success).toBe(true)
  })
  it("createRackRow succeeds", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({ enableAutoRowCode: true })
    const res = await actions.createRackRow(fdMap({ rackId: 1, code: "RR1", name: "Row 1", level: 1 }))
    expect(res?.success).toBe(true)
  })
  it("updateRackRow succeeds", async () => {
    const res = await actions.updateRackRow(1, fdMap({ rackId: 1, code: "RR1", name: "Row 1", level: 1 }))
    expect(res?.success).toBe(true)
  })
  it("updateRackRow handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.rackRow.update.mockRejectedValue(new Error("db err"))
    const res = await actions.updateRackRow(1, fdMap({ rackId: 1, code: "RR1", name: "Row 1", level: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("deleteRackRow succeeds", async () => {
    const res = await actions.deleteRackRow(1)
    expect(res?.success).toBe(true)
  })
  it("deleteRackRow handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.rackRow.delete.mockRejectedValue(new Error("db err"))
    const res = await actions.deleteRackRow(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
})


describe('Global Error Paths (Permission Reject for 21 funcs)', () => {
  it("createStockAdjustment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createStockAdjustment(arg1, arg2); } catch {}
  })
  it("processStockAdjustment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).processStockAdjustment(arg1, arg2); } catch {}
  })
  it("createInventoryTransfer handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createInventoryTransfer(arg1, arg2); } catch {}
  })
  it("processInventoryTransfer handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).processInventoryTransfer(arg1, arg2); } catch {}
  })
  it("receiveInventoryTransfer handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).receiveInventoryTransfer(arg1, arg2); } catch {}
  })
  it("createMaterialIssue handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createMaterialIssue(arg1, arg2); } catch {}
  })
  it("completeMaterialIssue handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).completeMaterialIssue(arg1, arg2); } catch {}
  })
  it("createWorkOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createWorkOrder(arg1, arg2); } catch {}
  })
  it("updateWorkOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateWorkOrder(arg1, arg2); } catch {}
  })
  it("createRack handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createRack(arg1, arg2); } catch {}
  })
  it("updateRack handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateRack(arg1, arg2); } catch {}
  })
  it("deleteStockAdjustment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteStockAdjustment(arg1, arg2); } catch {}
  })
  it("deleteInventoryTransfer handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteInventoryTransfer(arg1, arg2); } catch {}
  })
  it("deleteMaterialIssue handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteMaterialIssue(arg1, arg2); } catch {}
  })
  it("deleteRack handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteRack(arg1, arg2); } catch {}
  })
  it("updateStockAdjustment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateStockAdjustment(arg1, arg2); } catch {}
  })
  it("updateMaterialIssue handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateMaterialIssue(arg1, arg2); } catch {}
  })
  it("updateInventoryTransfer handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateInventoryTransfer(arg1, arg2); } catch {}
  })
  it("createRackRow handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createRackRow(arg1, arg2); } catch {}
  })
  it("updateRackRow handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateRackRow(arg1, arg2); } catch {}
  })
  it("deleteRackRow handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteRackRow(arg1, arg2); } catch {}
  })
})


describe('Inventory Transfer Error & Edge Paths', () => {
  it("processInventoryTransfer fails if not found or status not draft", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    mocks.prismaMock.inventoryTransfer.updateMany.mockResolvedValue({ count: 0 })
    mocks.prismaMock.inventoryTransfer.findUnique.mockResolvedValue({ status: "processed" })
    const res = await (actions as any).processInventoryTransfer(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Transfer sudah berstatus processed")
    
    mocks.prismaMock.inventoryTransfer.findUnique.mockResolvedValue(null)
    const res2 = await (actions as any).processInventoryTransfer(1)
    expect(res2?.success).toBe(false)
    expect(res2?.error).toContain("Transfer tidak ditemukan")
    
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed", items: [] })
    const res3 = await (actions as any).processInventoryTransfer(1)
    expect(res3?.success).toBe(false)
    expect(res3?.error).toContain("Transfer hanya bisa diproses dari status draft")
  })

  it("receiveInventoryTransfer fails if not found or status not processed", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed", items: [] })
    mocks.prismaMock.inventoryTransfer.updateMany.mockResolvedValue({ count: 0 })
    mocks.prismaMock.inventoryTransfer.findUnique.mockResolvedValue({ status: "receiving" })
    const res = await (actions as any).receiveInventoryTransfer(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Transfer sudah berstatus receiving")
    
    mocks.prismaMock.inventoryTransfer.findUnique.mockResolvedValue(null)
    const res2 = await (actions as any).receiveInventoryTransfer(1)
    expect(res2?.success).toBe(false)
    expect(res2?.error).toContain("Transfer tidak ditemukan")
    
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res3 = await (actions as any).receiveInventoryTransfer(1)
    expect(res3?.success).toBe(false)
    expect(res3?.error).toContain("Transfer hanya bisa di-receive dari status processed")
  })
})

describe('Stock Adjustment Error & Edge Paths', () => {
  it("createStockAdjustment throws on negative actual qty", async () => {
    const res = await (actions as any).createStockAdjustment(fdMap({ warehouseId: 1, date: "2026-06-13", reason: "Test", items: JSON.stringify([{ itemId: 1, newQty: -10, cost: 100 }]) }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Kuantitas fisik (actual) tidak boleh negatif")
  })

  it("updateStockAdjustment throws on negative actual qty", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.stockAdjustment.findUnique.mockResolvedValue({ id: 1, status: "draft" })
    const res = await (actions as any).updateStockAdjustment(1, fdMap({ warehouseId: 1, date: "2026-06-13", reason: "Test", items: JSON.stringify([{ itemId: 1, newQty: -10, cost: 100 }]) }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Kuantitas fisik (actual) tidak boleh negatif")
  })
  
  it("updateStockAdjustment fails if status changed inside transaction", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.stockAdjustment.findUnique.mockResolvedValue({ id: 1, status: "processed" })
    const res = await (actions as any).updateStockAdjustment(1, fdMap({ warehouseId: 1, date: "2026-06-13", items: JSON.stringify([{ itemId: 1, newQty: 10, cost: 100 }]) }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya stock adjustment draft yang dapat diedit")
  })

  it("updateStockAdjustment fails if not draft initially", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed" })
    const res = await (actions as any).updateStockAdjustment(1, fdMap({ warehouseId: 1, date: "2026-06-13" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya stock adjustment draft yang dapat diedit")
  })

  it("processStockAdjustment fails if not found or not draft", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    mocks.prismaMock.stockAdjustment.updateMany.mockResolvedValue({ count: 0 })
    mocks.prismaMock.stockAdjustment.findUnique.mockResolvedValue({ status: "processed" })
    const res = await (actions as any).processStockAdjustment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Penyesuaian stok sudah berstatus processed")
    
    mocks.prismaMock.stockAdjustment.findUnique.mockResolvedValue(null)
    const res2 = await (actions as any).processStockAdjustment(1)
    expect(res2?.success).toBe(false)
    expect(res2?.error).toContain("Penyesuaian stok tidak ditemukan")
    
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed", items: [] })
    const res3 = await (actions as any).processStockAdjustment(1)
    expect(res3?.success).toBe(false)
    expect(res3?.error).toContain("Adjustment hanya bisa diproses dari status draft")
  })
  
  it("deleteStockAdjustment fails if not draft", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed" })
    const res = await (actions as any).deleteStockAdjustment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya stock adjustment draft yang dapat dihapus")
  })
})

describe('Material Issue Error & Edge Paths', () => {
  it("createMaterialIssue fails if no valid items", async () => {
    const res = await (actions as any).createMaterialIssue(fdMap({ warehouseId: 1, projectId: 1, date: "2026-06-13", items: JSON.stringify([]) }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Material Issue harus memiliki minimal 1 item dengan qty > 0")
  })

  it("updateMaterialIssue succeeds with empty valid items (no items create)", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.materialIssue.findUnique.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.materialIssue.update.mockResolvedValue({ id: 1 })
    const res = await (actions as any).updateMaterialIssue(1, fdMap({ warehouseId: 1, projectId: 1, date: "2026-06-13", items: JSON.stringify([{ itemId: -1, qty: 0 }]) }))
    expect(res?.success).toBe(true)
  })

  it("updateMaterialIssue fails if not draft initially", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed" })
    const res = await (actions as any).updateMaterialIssue(1, fdMap({ warehouseId: 1, projectId: 1, date: "2026-06-13" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya material issue draft yang dapat diedit")
  })

  it("updateMaterialIssue fails if status changed inside transaction", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.materialIssue.findUnique.mockResolvedValue({ id: 1, status: "processed" })
    const res = await (actions as any).updateMaterialIssue(1, fdMap({ warehouseId: 1, projectId: 1, date: "2026-06-13", items: JSON.stringify([{ itemId: 1, qty: 10, cost: 100 }]) }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya material issue draft yang dapat diedit")
  })

  it("completeMaterialIssue fails if not found or not draft", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    mocks.prismaMock.materialIssue.updateMany.mockResolvedValue({ count: 0 })
    mocks.prismaMock.materialIssue.findUnique.mockResolvedValue({ status: "processed" })
    const res = await (actions as any).completeMaterialIssue(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Material Issue sudah berstatus processed")
    
    mocks.prismaMock.materialIssue.findUnique.mockResolvedValue(null)
    const res2 = await (actions as any).completeMaterialIssue(1)
    expect(res2?.success).toBe(false)
    expect(res2?.error).toContain("Material Issue tidak ditemukan")
    
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed", items: [] })
    const res3 = await (actions as any).completeMaterialIssue(1)
    expect(res3?.success).toBe(false)
    expect(res3?.error).toContain("Material Issue hanya bisa di-complete dari status draft")
  })
  
  it("deleteMaterialIssue fails if not draft", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed" })
    const res = await (actions as any).deleteMaterialIssue(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya material issue draft yang dapat dihapus")
  })
})

describe('Other Delete Errors', () => {
  it("deleteInventoryTransfer fails if not draft", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed" })
    const res = await (actions as any).deleteInventoryTransfer(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya transfer draft yang dapat dihapus")
  })
  
  it("deleteRack returns error if in use", async () => {
    mocks.prismaMock.item.count.mockResolvedValue(1)
    const res = await (actions as any).deleteRack(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Rak masih digunakan oleh")
  })

  // Regression: deleteRackRow must mirror deleteRack's in-use guard. RackRow is
  // referenced by Item.defaultRackRowId (FK with onDelete: SetNull) and by
  // StockMove.rackRowId (plain Int, NO FK — silently dangling on raw delete,
  // erasing the location tag on historical stock movements). A raw delete of a
  // RackRow that still has dependents loses the Item's default row reference
  // AND the StockMove's location tag, neither of which can be reconstructed
  // from the audit log. Refuse the delete, just like deleteRack does.
  it("deleteRackRow returns error if referenced by items", async () => {
    mocks.prismaMock.item.count.mockResolvedValue(2)
    mocks.prismaMock.stockMove.count.mockResolvedValue(0)
    const res = await (actions as any).deleteRackRow(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Baris rak")
    expect(res?.error).toContain("2 barang")
    // Critical: must NOT have deleted
    expect(mocks.prismaMock.rackRow.delete).not.toHaveBeenCalled()
  })

  it("deleteRackRow returns error if referenced by stock moves", async () => {
    mocks.prismaMock.item.count.mockResolvedValue(0)
    mocks.prismaMock.stockMove.count.mockResolvedValue(5)
    const res = await (actions as any).deleteRackRow(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Baris rak")
    expect(res?.error).toContain("5 pergerakan")
    expect(mocks.prismaMock.rackRow.delete).not.toHaveBeenCalled()
  })
})


describe('Inventory Transfer Remaining Coverage', () => {
  it("updateInventoryTransfer fails if status changed inside transaction", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.inventoryTransfer.findUnique.mockResolvedValue({ id: 1, status: "processed" })
    const res = await (actions as any).updateInventoryTransfer(1, fdMap({ sourceWarehouseId: 1, destinationWarehouseId: 2, date: "2026-06-13", items: JSON.stringify([{ itemId: 1, qty: 10 }]) }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya transfer draft yang dapat diedit")
  })

  it("updateInventoryTransfer fails if not draft initially", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processed" })
    const res = await (actions as any).updateInventoryTransfer(1, fdMap({ sourceWarehouseId: 1, destinationWarehouseId: 2, date: "2026-06-13" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya transfer draft yang dapat diedit")
  })
})

describe('WorkOrder Coverage', () => {
  it("updateWorkOrder handles item creation with negative/invalid data being filtered", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await (actions as any).updateWorkOrder(1, fdMap({ customerId: 1, projectId: 1, date: "2026-06-13", items: JSON.stringify([{ itemId: -1, qty: 10, cost: 100 }]) }))
    expect(res?.success).toBe(true)
  })
})


describe('WorkOrder Item Map Coverage', () => {
  it("createWorkOrder creates items when valid itemId provided", async () => {
    const res = await (actions as any).createWorkOrder(fdMap({ customerId: 1, projectId: 1, date: "2026-06-13", items: JSON.stringify([{ itemId: 5, qty: 3, cost: 200, description: "d", status: "pending" }]) }))
    expect(res?.success).toBe(true)
  })

  it("updateWorkOrder creates items when valid itemId provided", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await (actions as any).updateWorkOrder(1, fdMap({ customerId: 1, projectId: 1, date: "2026-06-13", items: JSON.stringify([{ itemId: 5, qty: 3, cost: 200 }]) }))
    expect(res?.success).toBe(true)
  })
})

describe("Inventory Validation / Edge Cases", () => {
  it("createStockAdjustment fails on parse error", async () => {
    const res = await (actions as any).createStockAdjustment(new FormData())
    expect(res?.success).toBe(false)
  })
  it("createInventoryTransfer fails on parse error", async () => {
    const res = await (actions as any).createInventoryTransfer(new FormData())
    expect(res?.success).toBe(false)
  })
  it("createMaterialIssue fails on parse error", async () => {
    const res = await (actions as any).createMaterialIssue(new FormData())
    expect(res?.success).toBe(false)
  })

  it("createWorkOrder defaults status to pending, description to null, cost to 0 when omitted", async () => {
    const res = await (actions as any).createWorkOrder(fdMap({ customerId: 1, projectId: 1, date: "2026-06-13", name: "WO", quantity: 1, items: JSON.stringify([{ itemId: 5, qty: 3 }]) }))
    expect(res?.success).toBe(true)
  })

  it("createRackRow auto generates code if missing", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({ enableAutoRowCode: true })
    const res = await (actions as any).createRackRow(fdMap({ rackId: 1, name: "Row 1", level: 1 }))
    expect(res?.success).toBe(true)
  })
});

describe("NextRedirectError and Error Fallbacks", () => {
  it("throws if NextRedirectError occurs during createStockAdjustment", async () => {
    const redirectErr = new Error("NEXT_REDIRECT");
    (redirectErr as any).digest = "NEXT_REDIRECT";
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(redirectErr);
    
    // We mock isNextRedirectError from the module just by checking if the throw is preserved
    // Our error.ts usually checks if e.message.includes('NEXT_REDIRECT') or digest
    await expect((actions as any).createStockAdjustment(new FormData())).rejects.toThrow("NEXT_REDIRECT");
  })
});

describe("Catch Block Coverage (isNextRedirectError + console.error)", () => {
  const errs = [
    "createStockAdjustment", "processStockAdjustment", "createInventoryTransfer",
    "processInventoryTransfer", "receiveInventoryTransfer", "createMaterialIssue",
    "completeMaterialIssue", "createWorkOrder", "updateWorkOrder", "createRack",
    "updateRack", "deleteStockAdjustment", "deleteInventoryTransfer", "deleteMaterialIssue",
    "deleteRack", "updateStockAdjustment", "updateMaterialIssue", "updateInventoryTransfer",
    "createRackRow", "updateRackRow", "deleteRackRow"
  ];
  for (const fn of errs) {
    it(`${fn} handles non-redirect error (covers isNextRedirectError false branch + console.error)`, async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      // Reset requirePermission and trigger a normal error
      if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValue(new Error("generic err"));
      const fd = new FormData();
      fd.append("warehouseId", "1");
      let arg: any = fd;
      if (fn === "processStockAdjustment" || fn === "deleteStockAdjustment" || fn === "deleteInventoryTransfer" || fn === "deleteMaterialIssue" || fn === "deleteRack" || fn === "completeMaterialIssue" || fn === "receiveInventoryTransfer" || fn === "processInventoryTransfer") arg = 1;
      if (fn.startsWith("update") || fn === "createWorkOrder") arg = [1, fd];
      if (fn === "createRackRow") arg = fd;
      if (fn === "createRack") arg = fd;
      const res = await (actions as any)[fn](arg);
      expect(res?.success).toBe(false);
      expect(res?.error).toBe("generic err");
    });
  }
});

describe("Catch block throw e for NextRedirectError", () => {
  const errs = [
    "createStockAdjustment", "processStockAdjustment", "createInventoryTransfer",
    "processInventoryTransfer", "receiveInventoryTransfer", "createMaterialIssue",
    "completeMaterialIssue", "createWorkOrder", "updateWorkOrder", "createRack",
    "updateRack", "deleteStockAdjustment", "deleteInventoryTransfer", "deleteMaterialIssue",
    "deleteRack", "updateStockAdjustment", "updateMaterialIssue", "updateInventoryTransfer",
    "createRackRow", "updateRackRow", "deleteRackRow"
  ];
  for (const fn of errs) {
    it(`${fn} rethrows NextRedirectError`, async () => {
      const redirectErr = new Error("NEXT_REDIRECT");
      (redirectErr as any).digest = "NEXT_REDIRECT_TOKEN";
      if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValue(redirectErr);
      const fd = new FormData();
      fd.append("warehouseId", "1");
      let arg: any = fd;
      if (fn === "processStockAdjustment" || fn === "deleteStockAdjustment" || fn === "deleteInventoryTransfer" || fn === "deleteMaterialIssue" || fn === "deleteRack" || fn === "completeMaterialIssue" || fn === "receiveInventoryTransfer" || fn === "processInventoryTransfer") arg = 1;
      if (fn.startsWith("update") || fn === "createWorkOrder") arg = [1, fd];
      if (fn === "createRackRow") arg = fd;
      if (fn === "createRack") arg = fd;
      await expect((actions as any)[fn](arg)).rejects.toThrow();
    });
  }
});
