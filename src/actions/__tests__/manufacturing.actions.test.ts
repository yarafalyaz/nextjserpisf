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
    salesOrder: buildModelMock(),
    deliveryOrder: buildModelMock(),
    deliveryOrderItem: buildModelMock(),
    projectStage: buildModelMock(),
    project: buildModelMock(),

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

  it("deleteProduct succeeds", async () => {
    const res = await actions.deleteProduct(1)
    expect(res?.success).toBe(true)
  })
})

describe("Production Order Actions", () => {
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
      materials: [{ itemId: 1, qty: 2 }, { itemId: 2, qty: 3 }]
    })
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
        materials: {
          create: [
            { itemId: 1, qty: 10 },
            { itemId: 2, qty: 15 },
          ]
        }
      })
    }))
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
          licensePlate: "B 1",
          vehicle: { variant: { name: "V" } }
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
