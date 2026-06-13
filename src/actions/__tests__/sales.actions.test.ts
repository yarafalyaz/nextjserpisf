import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const requirePermissionMock = vi.fn()
  const revalidateMock = vi.fn()
  const logActivityMock = vi.fn()
  const generateDocNumMock = vi.fn()
  const safeJsonParseMock = vi.fn((s: any) => {
    if (typeof s === "string") { try { return JSON.parse(s) } catch { return null } }
    return s
  })
  const notifyAdminsMock = vi.fn()
  const notifyUserMock = vi.fn()
  const notifyRoleMock = vi.fn()
  const onSalesInvoicePostedMock = vi.fn()
  const onSalesPaymentCreatedMock = vi.fn()
  const onSalesPaymentUpdatedMock = vi.fn()
  const onSalesPaymentDeletedMock = vi.fn()
  const onSalesReturnCompletedMock = vi.fn()
  const onDownPaymentConfirmedMock = vi.fn()
  const onDownPaymentReceivedMock = vi.fn()
  const deleteJournalByReferenceMock = vi.fn()
  const deleteJournalByReferenceTxMock = vi.fn()
  const resyncOnEditMock = vi.fn()
  const findOverReturnMock = vi.fn().mockResolvedValue([])
  const safeParseId = (v: any) => Number(v)

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
    aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
  })

  const prismaMock = {
    quotation: buildModelMock(),
    quotationSection: buildModelMock(),
    quotationItem: buildModelMock(),
    quotationHistory: buildModelMock(),
    customerVehicle: buildModelMock(),
    customer: buildModelMock(),
    salesOrder: buildModelMock(),
    salesOrderItem: buildModelMock(),
    salesInvoice: buildModelMock(),
    salesInvoiceItem: buildModelMock(),
    salesPayment: buildModelMock(),
    salesPaymentAllocation: buildModelMock(),
    salesReturn: buildModelMock(),
    salesReturnItem: buildModelMock(),
    deliveryOrder: buildModelMock(),
    deliveryOrderItem: buildModelMock(),
    downPayment: buildModelMock(),
    documentSequence: buildModelMock(),
    item: buildModelMock(),
    itemStock: buildModelMock(),
    journal: buildModelMock(),
    journalEntry: buildModelMock(),
    account: buildModelMock(),
    user: buildModelMock(),
    setting: buildModelMock(),
    systemSetting: buildModelMock(),
    role: buildModelMock(),
    permission: buildModelMock(),
    rolePermission: buildModelMock(),
    activityLog: buildModelMock(),
    notification: buildModelMock(),
    employee: buildModelMock(),
    department: buildModelMock(),
    workOrder: buildModelMock(),
    workOrderItem: buildModelMock(),
    project: buildModelMock(),
    stockMove: buildModelMock(),
    inventoryLayer: buildModelMock(),
    transactionAttachment: buildModelMock(),
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") {
        return ops(prismaMock)
      }
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock,
    revalidateMock,
    logActivityMock,
    generateDocNumMock,
    safeJsonParseMock,
    notifyAdminsMock,
    notifyUserMock,
    notifyRoleMock,
    onSalesInvoicePostedMock,
    onSalesPaymentCreatedMock,
    onSalesPaymentUpdatedMock,
    onSalesPaymentDeletedMock,
    onSalesReturnCompletedMock,
    onDownPaymentConfirmedMock,
    onDownPaymentReceivedMock,
    deleteJournalByReferenceMock,
    deleteJournalByReferenceTxMock,
    resyncOnEditMock,
    findOverReturnMock,
    prismaMock,
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prismaMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocNumMock(...a),
}))

vi.mock("@/lib/utils/safe-parse", async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    safeJsonParse: mocks.safeJsonParseMock,
  }
})

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: {
    notifyAdmins: (...a: unknown[]) => mocks.notifyAdminsMock(...a),
    notifyUser: (...a: unknown[]) => mocks.notifyUserMock(...a),
    notifyRole: (...a: unknown[]) => mocks.notifyRoleMock(...a),
  },
}))

vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: (...a: unknown[]) => mocks.onSalesInvoicePostedMock(...a),
  onSalesPaymentCreated: (...a: unknown[]) => mocks.onSalesPaymentCreatedMock(...a),
  onSalesReturnCompleted: (...a: unknown[]) => mocks.onSalesReturnCompletedMock(...a),
  onDownPaymentReceived: (...a: unknown[]) => mocks.onDownPaymentReceivedMock(...a),
  deleteJournalByReference: (...a: unknown[]) => mocks.deleteJournalByReferenceMock(...a),
  deleteJournalByReferenceTx: (...a: unknown[]) => mocks.deleteJournalByReferenceTxMock(...a),
}))

vi.mock("@/lib/hooks/down-payment.hook", () => ({
  onDownPaymentConfirmed: (...a: unknown[]) => mocks.onDownPaymentConfirmedMock(...a),
}))

vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: (...a: unknown[]) => mocks.onSalesPaymentCreatedMock(...a),
  onSalesPaymentUpdated: (...a: unknown[]) => mocks.onSalesPaymentUpdatedMock(...a),
  onSalesPaymentDeleted: (...a: unknown[]) => mocks.onSalesPaymentDeletedMock(...a),
}))

vi.mock("@/lib/hooks/sales-return.hook", () => ({
  onSalesReturnCompleted: (...a: unknown[]) => mocks.onSalesReturnCompletedMock(...a),
}))

vi.mock("@/lib/services/quotation-sync.service", () => ({
  resyncOnEdit: (...a: unknown[]) => mocks.resyncOnEditMock(...a),
}))

vi.mock("@/lib/sales/return-validation", () => ({
  findOverReturn: (...a: unknown[]) => mocks.findOverReturnMock(...a),
}))

import * as actions from "../sales.actions"

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

const basicPayload = {
  customerId: 1,
  date: "2026-06-12",
  sections: [],
  discount: 0,
  tax: 0,
}

describe("Quotation Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("Q-001")
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue({ id: 1 })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ 
      id: 1, status: "draft", sections: [{ items: [{ id: 1 }] }] 
    })
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createQuotation succeeds", async () => {
    const res = await actions.createQuotation(fdQuotation({ ...basicPayload, customerVehicleId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("updateQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft", customerId: 1, customerVehicleId: 1 })
    const res = await actions.updateQuotation(1, fdMap({ customerId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("sendQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotationItem.count.mockResolvedValue(1)
    const res = await actions.sendQuotation(1)
    expect(res?.success).toBe(true)
  })
  it("acceptQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent" })
    const res = await actions.acceptQuotation(1)
    expect(res?.success).toBe(true)
  })
  it("rejectQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent" })
    const res = await actions.rejectQuotation(1)
    expect(res?.success).toBe(true)
  })
  it("reviseQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent" })
    const res = await actions.reviseQuotation(1, "reason")
    expect(res?.success).toBe(true)
  })
  it("deleteQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteQuotation(1)
    expect(res?.success).toBe(true)
  })
  it("convertQuotationToOrder succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ 
      id: 1, status: "accepted", sections: [], documentNo: "Q-100", subtotal: 100, grandTotal: 100 
    })
    const res = await actions.convertQuotationToOrder(1)
    expect(res?.success).toBe(true)
  })
})

describe("Sales Order Actions", () => {
  it("createSalesOrder succeeds", async () => {
    const res = await actions.createSalesOrder(fdMap({ customerId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesOrder succeeds", async () => {
    const res = await actions.updateSalesOrder(1, fdMap({ customerId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("confirmSalesOrder succeeds", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.confirmSalesOrder(1)
    expect(res?.success).toBe(true)
  })
  it("processSalesOrder succeeds", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "confirmed" })
    const res = await actions.processSalesOrder(1)
    expect(res?.success).toBe(true)
  })
  it("completeSalesOrder succeeds", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processing" })
    const res = await actions.completeSalesOrder(1)
    expect(res?.success).toBe(true)
  })
  it("deleteSalesOrder succeeds", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteSalesOrder(1)
    expect(res?.success).toBe(true)
  })
})

describe("Sales Invoice Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ 
      id: 1, status: "draft", sections: [{ items: [{ id: 1, itemId: 1, qty: 1, unitPrice: 100 }] }],
      items: [{ id: 1, itemId: 1, qty: 1, unitPrice: 100 }], paidAmount: 0,
    })
  })
  it("createSalesInvoice succeeds", async () => {
    const res = await actions.createSalesInvoice(fdMap({ customerId: "1", date: "2026-06-12", dueDate: "2026-06-20" }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesInvoice succeeds", async () => {
    const res = await actions.updateSalesInvoice(1, fdMap({ customerId: "1", date: "2026-06-12", dueDate: "2026-06-20" }))
    expect(res?.success).toBe(true)
  })
  it("postInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoiceItem.count.mockResolvedValueOnce(1)
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, status: "draft", customerId: 1, grandTotal: 100, paidAmount: 0
    })
    mocks.prismaMock.customer.findUnique.mockResolvedValueOnce({ creditLimit: 0, name: "CUST" })
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(true)
  })
  it("deleteSalesInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, status: "draft", customerId: 1
    })
    mocks.prismaMock.salesPayment.findMany.mockResolvedValueOnce([])
    const res = await actions.deleteSalesInvoice(1)
    expect(res?.success).toBe(true)
  })
  it("voidSalesInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, status: "posted", customerId: 1, grandTotal: 100, paidAmount: 0, payments: []
    })
    mocks.prismaMock.customer.findUnique.mockResolvedValueOnce({ creditLimit: 0, name: "CUST" })
    const res = await actions.voidSalesInvoice(1)
    expect(res?.success).toBe(true)
  })
})

describe("Sales Payment Actions", () => {
  it("createSalesPayment succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, grandTotal: 1000, status: "posted", customerId: 1, paidAmount: 0 })
    const res = await actions.createSalesPayment(fdMap({ salesInvoiceId: "1", paymentDate: "2026-06-12", paymentMethod: "cash", amount: "100" }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesPayment succeeds", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, grandTotal: 1000 })
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: "1", paymentDate: "2026-06-12", paymentMethod: "cash", amount: "100" }))
    expect(res?.success).toBe(true)
  })
  it("deleteSalesPayment succeeds", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1 })
    const res = await actions.deleteSalesPayment(1)
    expect(res?.success).toBe(true)
  })
})

describe("Sales Return Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1 })
    mocks.prismaMock.salesInvoice.findFirst.mockResolvedValue({ id: 1, customerId: 1 })
  })
  it("createSalesReturn succeeds", async () => {
    mocks.findOverReturnMock.mockReturnValue(null)
    mocks.prismaMock.salesInvoiceItem.findMany.mockResolvedValue([{ itemId: 1, unitPrice: 100, qty: 10 }])
    const res = await actions.createSalesReturn(fdMap({ customerId: "1", salesInvoiceId: "1", date: "2026-06-12", items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 100 }]) }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesReturn succeeds", async () => {
    mocks.findOverReturnMock.mockReturnValue(null)
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.salesInvoiceItem.findMany.mockResolvedValue([{ itemId: 1, unitPrice: 100, qty: 10 }])
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: "1", salesInvoiceId: "1", date: "2026-06-12", items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 100 }]) }))
    expect(res?.success).toBe(true)
  })
  it("completeSalesReturn succeeds", async () => {
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await actions.completeSalesReturn(1)
    expect(res?.success).toBe(true)
  })
  it("deleteSalesReturn succeeds", async () => {
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteSalesReturn(1)
    expect(res?.success).toBe(true)
  })
})

describe("Delivery Order Actions", () => {
  it("createDeliveryOrder succeeds", async () => {
    const res = await actions.createDeliveryOrder(fdMap({ salesOrderId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("updateDeliveryOrder succeeds", async () => {
    const res = await actions.updateDeliveryOrder(1, fdMap({ salesOrderId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("deleteDeliveryOrder succeeds", async () => {
    const res = await actions.deleteDeliveryOrder(1)
    expect(res?.success).toBe(true)
  })
})

describe("Down Payment Actions", () => {
  it("createDownPayment succeeds", async () => {
    const res = await actions.createDownPayment(fdMap({ quotationId: "1", amount: "100", paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("updateDownPayment succeeds", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: "1", amount: "100", paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("confirmDownPayment succeeds", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.confirmDownPayment(1)
    expect(res?.success).toBe(true)
  })
  it("deleteDownPayment succeeds", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteDownPayment(1)
    expect(res?.success).toBe(true)
  })
})
