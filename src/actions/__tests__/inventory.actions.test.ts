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
      groupBy: vi.fn().mockResolvedValue([]),
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
