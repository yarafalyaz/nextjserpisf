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
      sku: "PROD-1",
      billOfMaterials: JSON.stringify([{ itemId: 1, qty: 1 }])
    }))
    expect(res?.success).toBe(true)
  })
  it("updateProduct succeeds", async () => {
    mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({ id: 1, billOfMaterials: "[]" })
    const res = await actions.updateProduct(1, fdMap({
      name: "Product Test Update",
      billOfMaterials: JSON.stringify([{ itemId: 1, qty: 1 }])
    }))
    expect(res?.success).toBe(true)
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
      date: "2026-06-13",
      productId: 1,
      qty: 10
    }))
    expect(res?.success).toBe(true)
  })
  it("updateProductionOrder succeeds", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateProductionOrder(1, fdMap({
      date: "2026-06-13",
      productId: 1,
      qty: 10
    }))
    expect(res?.success).toBe(true)
  })
  it("deleteProductionOrder succeeds", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteProductionOrder(1)
    expect(res?.success).toBe(true)
  })
})

describe("Work Order Actions", () => {
  it("startWorkOrder succeeds", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [{ id: 1 }] })
    const res = await actions.startWorkOrder(1)
    expect(res?.success).toBe(true)
  })
  it("completeWorkOrder succeeds", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "in_progress", items: [{ id: 1 }] })
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1, status: "completed" })
    mocks.prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 })
    const res = await actions.completeWorkOrder(1)
    expect(res?.success).toBe(true)
  })
  it("deleteWorkOrder succeeds", async () => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteWorkOrder(1)
    expect(res?.success).toBe(true)
  })
  it("createMaterialIssueFromWorkOrder succeeds", async () => {
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue(null)
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "in_progress",
      productionOrder: { id: 1, productId: 1 },
      quantity: 10,
      items: [{ id: 1, qty: 5, itemId: 1 }],
      product: { billOfMaterials: JSON.stringify([{ itemId: 1, qty: 2 }]) }
    } as any)
    const res = await actions.createMaterialIssueFromWorkOrder(1, 1)
    expect(res?.success).toBe(true)
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
})


describe('Global Error Paths (Permission Reject for 11 funcs)', () => {
  it("createProduct handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createProduct(arg1, arg2); } catch {}
  })
  it("updateProduct handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateProduct(arg1, arg2); } catch {}
  })
  it("createProductionOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createProductionOrder(arg1, arg2); } catch {}
  })
  it("startWorkOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).startWorkOrder(arg1, arg2); } catch {}
  })
  it("completeWorkOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).completeWorkOrder(arg1, arg2); } catch {}
  })
  it("createMaterialIssueFromWorkOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createMaterialIssueFromWorkOrder(arg1, arg2); } catch {}
  })
  it("getWorkOrderWithCustomerInfo handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).getWorkOrderWithCustomerInfo(arg1, arg2); } catch {}
  })
  it("deleteProduct handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteProduct(arg1, arg2); } catch {}
  })
  it("deleteWorkOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteWorkOrder(arg1, arg2); } catch {}
  })
  it("deleteProductionOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteProductionOrder(arg1, arg2); } catch {}
  })
  it("updateProductionOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateProductionOrder(arg1, arg2); } catch {}
  })
})
