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
    purchaseRequest: buildModelMock(),
    purchaseRequestItem: buildModelMock(),
    purchaseOrder: buildModelMock(),
    purchaseOrderItem: buildModelMock(),
    goodsReceipt: buildModelMock(),
    goodsReceiptItem: buildModelMock(),
    vendorBill: buildModelMock(),
    vendorBillItem: buildModelMock(),
    vendorPayment: buildModelMock(),
    vendorPaymentAllocation: buildModelMock(),
    purchaseReturn: buildModelMock(),
    purchaseReturnItem: buildModelMock(),
    purchaseHistory: buildModelMock(),
    journal: buildModelMock(),
    inventory: buildModelMock(),
    inventoryMovement: buildModelMock(),
    stockMove: buildModelMock(),
    inventoryLayer: buildModelMock(),
    batch: buildModelMock(),
    vendor: buildModelMock(),
    item: buildModelMock(),
    
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    generateDocNumMock: vi.fn(),
    createGlJournalMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: mocks.generateDocNumMock }))
vi.mock("@/lib/services/journal-builder.service", () => ({ createGlJournal: mocks.createGlJournalMock }))
vi.mock("@/lib/services/inventory.service", () => ({
  inventoryService: { receivePurchase: vi.fn().mockResolvedValue({}), processPurchaseReturn: vi.fn().mockResolvedValue({}) }
}))
vi.mock("@/lib/services/notification.service", () => ({
  notificationService: { notifyAdmins: vi.fn().mockResolvedValue({}) }
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn().mockResolvedValue({}),
  assertApproved: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onPurchaseReturnProcessed: vi.fn().mockResolvedValue({}),
  onVendorBillPosted: vi.fn().mockResolvedValue({}),
  onVendorPaymentCreated: vi.fn().mockResolvedValue({}),
  deleteJournalByReference: vi.fn().mockResolvedValue({}),
  deleteJournalByReferenceTx: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/goods-receipt.hook", () => ({
  onGoodsReceiptVerified: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/purchase-order.hook", () => ({
  onPurchaseOrderCreated: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/purchase-return.hook", () => ({
  onPurchaseReturnProcessed: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/sales/return-validation", () => ({ findOverReturn: vi.fn().mockReturnValue(null) }))
vi.mock("@/lib/finance/payment-allocation", () => ({ allocatePaymentToBills: vi.fn().mockReturnValue([]) }))

import * as actions from "../purchase.actions"

function fdQuotation(payload: any): FormData {
  const f = new FormData()
  f.append("data", JSON.stringify(payload))
  return f
}

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
  mocks.generateDocNumMock.mockResolvedValue("DOC-001")
})

describe("Purchase Actions Smoke Tests", () => {
  it("exports everything", () => {
    expect(actions.createPurchaseRequest).toBeDefined()
  })
})

describe("Purchase Request Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.purchaseRequest.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createPurchaseRequest succeeds", async () => {
    const res = await actions.createPurchaseRequest(fdMap({
      date: "2026-06-12",
      title: "PR Test",
      items: JSON.stringify([{ itemId: 1, qty: 10, notes: "important" }])
    }))
    expect(res?.success).toBe(true)
  })

  it("updatePurchaseRequest succeeds", async () => {
    const res = await actions.updatePurchaseRequest(1, fdMap({
      date: "2026-06-12",
      title: "PR Test Updated",
      items: JSON.stringify([{ itemId: 1, qty: 12, notes: "updated" }])
    }))
    expect(res?.success).toBe(true)
  })

  it("approvePurchaseRequest succeeds", async () => {
    const res = await actions.approvePurchaseRequest(1)
    expect(res?.success).toBe(true)
  })

  it("deletePurchaseRequest succeeds", async () => {
    const res = await actions.deletePurchaseRequest(1)
    expect(res?.success).toBe(true)
  })
})

describe("Purchase Order Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createPurchaseOrder succeeds", async () => {
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("updatePurchaseOrder succeeds", async () => {
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1200, discount: 0 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("approvePurchaseOrder succeeds", async () => {
    const res = await actions.approvePurchaseOrder(1)
    expect(res?.success).toBe(true)
  })

  it("markPurchaseOrderOrdered succeeds", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved" })
    const res = await actions.markPurchaseOrderOrdered(1)
    expect(res?.success).toBe(true)
  })

  it("cancelPurchaseOrder succeeds", async () => {
    const res = await actions.cancelPurchaseOrder(1)
    expect(res?.success).toBe(true)
  })
})

describe("Goods Receipt Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createGoodsReceipt succeeds", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "ordered", items: [{ itemId: 1, qty: 10 }] })
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1",
      warehouseId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitCost: 1000 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("updateGoodsReceipt succeeds", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "ordered", items: [{ itemId: 1, qty: 10 }] })
    const res = await actions.updateGoodsReceipt(1, fdMap({
      purchaseOrderId: "1",
      warehouseId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 6, unitCost: 1000 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("verifyGoodsReceipt succeeds", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 1, items: [{ itemId: 1, qty: 5, unitCost: 1000 }]
    })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, items: [{ itemId: 1, qty: 10 }]
    })
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([])
    
    const res = await actions.verifyGoodsReceipt(1)
    expect(res?.success).toBe(true)
  })

  it("deleteGoodsReceipt succeeds", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await actions.deleteGoodsReceipt(1)
    expect(res?.success).toBe(true)
  })
})

describe("Vendor Bill Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createVendorBill succeeds", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      purchaseOrderId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000"
    }))
    expect(res?.success).toBe(true)
  })

  it("updateVendorBill succeeds", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "1",
      purchaseOrderId: "1",
      date: "2026-06-12",
      subtotal: "1200",
      tax: "0",
      grandTotal: "1200"
    }))
    expect(res?.success).toBe(true)
  })

  it("confirmVendorBill succeeds", async () => {
    // Needs 3-way match
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(true)
  })

  it("voidVendorBill succeeds", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", payments: [] })
    const res = await actions.voidVendorBill(1)
    expect(res?.success).toBe(true)
  })

  it("deleteVendorBill succeeds", async () => {
    const res = await actions.deleteVendorBill(1)
    expect(res?.success).toBe(true)
  })
})

describe("Vendor Payment Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createVendorPayment succeeds", async () => {
    const res = await actions.createVendorPayment(fdMap({
      vendorId: "1",
      amount: "1000",
      paymentDate: "2026-06-12",
      paymentMethod: "cash"
    }))
    expect(res?.success).toBe(true)
  })

  it("updateVendorPayment succeeds", async () => {
    const res = await actions.updateVendorPayment(1, fdMap({
      vendorId: "1",
      amount: "1200",
      paymentDate: "2026-06-12",
      paymentMethod: "cash"
    }))
    expect(res?.success).toBe(true)
  })

  it("confirmVendorPayment succeeds", async () => {
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(true)
  })

  it("deleteVendorPayment succeeds", async () => {
    const res = await actions.deleteVendorPayment(1)
    expect(res?.success).toBe(true)
  })
})

describe("Purchase Return Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createPurchaseReturn succeeds", async () => {
    const res = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 2 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("updatePurchaseReturn succeeds", async () => {
    const res = await actions.updatePurchaseReturn(1, fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 3 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("processPurchaseReturn succeeds", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValue({ 
      id: 1, status: "draft", items: [{ itemId: 1, qty: 3 }], purchaseOrderId: 1 
    })
    const res = await actions.processPurchaseReturn(1)
    expect(res?.success).toBe(true)
  })

  it("deletePurchaseReturn succeeds", async () => {
    const res = await actions.deletePurchaseReturn(1)
    expect(res?.success).toBe(true)
  })
})
