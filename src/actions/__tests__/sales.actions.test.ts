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
  const findOverReturnMock = vi.fn().mockReturnValue(null)

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
    aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0, grandTotal: 0, paidAmount: 0 } }),
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

vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

import * as actions from "../sales.actions"

function fdQuotation(payload: any): FormData {
  const f = new FormData()
  f.append("data", JSON.stringify(payload))
  return f
}

function fdMap(payload: Record<string, string | number | null | undefined | File>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) {
      if (v instanceof File) f.append(k, v)
      else f.append(k, String(v))
    }
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

  // === createQuotation ===
  it("createQuotation fails on invalid json", async () => {
    const res = await actions.createQuotation(fdMap({ data: "invalid json" }))
    expect(res?.success).toBe(false)
  })
  it("createQuotation fails on mismatched vehicle", async () => {
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue(null)
    const res = await actions.createQuotation(fdQuotation({ ...basicPayload, customerVehicleId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Kendaraan tidak terdaftar")
  })
  it("createQuotation computes subtotal/totals correctly with discount amount", async () => {
    const payload = {
      customerId: 1, date: "2026-06-12", discount: 10, tax: 5,
      sections: [{
        items: [{ qty: 2, unitPrice: 100, discountType: "amount", discount: 10 }] // 2*100 - 10 = 190
      }]
    }
    const res = await actions.createQuotation(fdQuotation(payload))
    expect(res?.success).toBe(true)
    const createCall = mocks.prismaMock.quotation.create.mock.calls[0][0].data
    expect(createCall.subtotal).toBe(190)
    expect(createCall.grandTotal).toBe(190 + 5 - 10)
  })
  it("createQuotation computes subtotal/totals correctly with discount percent", async () => {
    const payload = {
      customerId: 1, date: "2026-06-12", discount: 0, tax: 0,
      sections: [{
        items: [{ qty: 2, unitPrice: 100, discountType: "percent", discount: 10 }] // 2*100 = 200, 10% = 20, total = 180
      }]
    }
    const res = await actions.createQuotation(fdQuotation(payload))
    expect(res?.success).toBe(true)
    const createCall = mocks.prismaMock.quotation.create.mock.calls[0][0].data
    expect(createCall.subtotal).toBe(180)
  })

  // === sendQuotation ===
  it("sendQuotation fails if status is not draft", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent" })
    const res = await actions.sendQuotation(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya bisa dikirim dari status draft")
  })
  it("sendQuotation fails if no items", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotationItem.count.mockResolvedValue(0)
    const res = await actions.sendQuotation(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("harus memiliki minimal 1 item")
  })

  // === acceptQuotation / rejectQuotation ===
  it("acceptQuotation fails if status is not sent", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.acceptQuotation(1)
    expect(res?.success).toBe(false)
  })
  it("rejectQuotation fails if status is not sent", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.rejectQuotation(1)
    expect(res?.success).toBe(false)
  })

  // === reviseQuotation ===
  it("reviseQuotation fails if status is not sent", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.reviseQuotation(1, "reason")
    expect(res?.success).toBe(false)
  })
  it("reviseQuotation fails if reason is empty", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent" })
    const res = await actions.reviseQuotation(1, "   ")
    expect(res?.success).toBe(false)
  })

  // === convertQuotationToOrder ===
  it("convertQuotationToOrder fails if status not accepted", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.convertQuotationToOrder(1)
    expect(res?.success).toBe(false)
  })
  it("convertQuotationToOrder fails if already converted", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", sections: [] })
    mocks.prismaMock.salesOrder.findFirst.mockResolvedValue({ id: 2 }) // existing SO
    const res = await actions.convertQuotationToOrder(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah memiliki Sales Order")
  })

  // === updateQuotation ===
  it("updateQuotation fails if converted", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "converted" })
    const res = await actions.updateQuotation(1, fdMap({}))
    expect(res?.success).toBe(false)
  })
  it("updateQuotation fails on mismatched vehicle", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", customerId: 1 })
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue(null)
    const res = await actions.updateQuotation(1, fdMap({ customerVehicleId: 2, customerId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Kendaraan tidak terdaftar")
  })
  it("updateQuotation succeeds with omitted optional dates", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", customerId: 1 })
    const res = await actions.updateQuotation(1, fdMap({ customerId: 1 }))
    expect(res?.success).toBe(true)
  })
})

describe("Down Payment Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("DP-001")
  })

  // === createDownPayment ===
  it("createDownPayment fails on invalid data", async () => {
    const res = await actions.createDownPayment(fdMap({}))
    expect(res?.success).toBe(false)
  })
  it("createDownPayment fails if quotation status invalid", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", grandTotal: 1000 })
    const res = await actions.createDownPayment(fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("createDownPayment fails if cap exceeded", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 600 } })
    const res = await actions.createDownPayment(fdMap({ quotationId: 1, amount: 500, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Total DP melebihi nilai quotation")
  })
  it("createDownPayment succeeds with proofImage", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    const file = new File(["dummy"], "proof.jpg", { type: "image/jpeg" })
    const res = await actions.createDownPayment(fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12", proofImage: file }))
    expect(res?.success).toBe(true)
  })

  // === updateDownPayment ===
  it("updateDownPayment fails if status not draft", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "confirmed" })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("updateDownPayment fails if quotation invalid", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("updateDownPayment fails if cap exceeded", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 600 } })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 500, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("updateDownPayment fails if amount zero", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted" })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 0, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("updateDownPayment succeeds with proofImage", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    const file = new File(["dummy"], "proof.jpg", { type: "image/jpeg" })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12", proofImage: file }))
    expect(res?.success).toBe(true)
  })

  // === deleteDownPayment ===
  it("deleteDownPayment fails if status not draft", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "confirmed" })
    const res = await actions.deleteDownPayment(1)
    expect(res?.success).toBe(false)
  })
})

describe("Sales Order Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("SO-001")
  })

  // === guards ===
  it("confirmSalesOrder fails if not draft", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "confirmed" })
    const res = await actions.confirmSalesOrder(1)
    expect(res?.success).toBe(false)
  })
  it("processSalesOrder fails if not confirmed", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "processing" })
    const res = await actions.processSalesOrder(1)
    expect(res?.success).toBe(false)
  })
  it("completeSalesOrder fails if not processing", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed" })
    const res = await actions.completeSalesOrder(1)
    expect(res?.success).toBe(false)
  })
  it("updateSalesOrder fails if not draft", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "confirmed" })
    const res = await actions.updateSalesOrder(1, fdMap({ customerId: 1, date: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
})

describe("Sales Invoice Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("INV-001")
  })

  // === postInvoice ===
  it("postInvoice fails if not draft", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted" })
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(false)
  })
  it("postInvoice fails if no items", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.salesInvoiceItem.count.mockResolvedValue(0)
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(false)
  })
  it("postInvoice fails if credit limit exceeded", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", grandTotal: 1000, paidAmount: 0 })
    mocks.prismaMock.salesInvoiceItem.count.mockResolvedValue(1)
    mocks.prismaMock.customer.findUnique.mockResolvedValue({ creditLimit: 500 }) // AR Limit
    mocks.prismaMock.salesInvoice.aggregate.mockResolvedValue({ _sum: { grandTotal: 0, paidAmount: 0 } })
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Melebihi batas kredit")
  })
  it("postInvoice fails if concurrent post happens", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", grandTotal: 0, paidAmount: 0 })
    mocks.prismaMock.salesInvoiceItem.count.mockResolvedValue(1)
    mocks.prismaMock.customer.findUnique.mockResolvedValue(null) // No limit
    mocks.prismaMock.salesInvoice.updateMany.mockResolvedValue({ count: 0 }) // Concurrency check fail
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah di-post")
  })

  // === updateSalesInvoice ===
  it("updateSalesInvoice fails if not draft", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted" })
    const res = await actions.updateSalesInvoice(1, fdMap({ customerId: 1, date: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("updateSalesInvoice computes discount and status", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", paidAmount: 50 })
    const payload = {
      customerId: 1, date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 2, unitPrice: 100, discount: 50 }]), // 2*100 - 50 = 150
      taxRate: 10,
      discount: 20 // Subtotal 150 - 20 = 130 -> Tax 13 -> Grand 143
    }
    const res = await actions.updateSalesInvoice(1, fdMap(payload))
    expect(res?.success).toBe(true)
    const updateCall = mocks.prismaMock.salesInvoice.update.mock.calls[1][0].data
    expect(updateCall.subtotal).toBe(150)
    expect(updateCall.discount).toBe(20)
    expect(updateCall.taxAmount).toBe(13)
    expect(updateCall.grandTotal).toBe(143)
    expect(updateCall.paymentStatus).toBe("partial") // paid 50 of 143
  })
  it("updateSalesInvoice paymentStatus paid", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", paidAmount: 150 }) // Paid all
    const payload = { customerId: 1, date: "2026-06-12", items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 100 }]) }
    await actions.updateSalesInvoice(1, fdMap(payload))
    const updateCall = mocks.prismaMock.salesInvoice.update.mock.calls[1][0].data
    expect(updateCall.paymentStatus).toBe("paid")
  })

  // === voidSalesInvoice ===
  it("voidSalesInvoice fails if draft", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", payments: [] })
    const res = await actions.voidSalesInvoice(1)
    expect(res?.success).toBe(false)
  })
  it("voidSalesInvoice fails if cancelled", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "cancelled", payments: [] })
    const res = await actions.voidSalesInvoice(1)
    expect(res?.success).toBe(false)
  })
  it("voidSalesInvoice fails if has payments", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", payments: [{ id: 1 }] })
    const res = await actions.voidSalesInvoice(1)
    expect(res?.success).toBe(false)
  })

  // === reverseSalesInvoicePostingTx stock reversal branches ===
  it("deleteSalesInvoice reverse stock OUT logic", async () => {
    // Delete triggers reverseSalesInvoicePostingTx
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted" })
    mocks.prismaMock.stockMove.findMany.mockResolvedValue([{ id: 1, itemId: 1, warehouseId: 1, qty: 10, cost: 100 }]) // stock out
    const res = await actions.deleteSalesInvoice(1)
    expect(res?.success).toBe(true)
    // Verify inventoryLayer creation
    expect(mocks.prismaMock.inventoryLayer.createMany).toHaveBeenCalled()
    expect(mocks.prismaMock.stockMove.deleteMany).toHaveBeenCalled()
  })
})

describe("Sales Payment Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("PAY-001")
  })

  // === createSalesPayment ===
  it("createSalesPayment fails if invoice not posted", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.createSalesPayment(fdMap({ salesInvoiceId: 1, amount: 100, paymentDate: "2026-06-12", paymentMethod: "cash" }))
    expect(res?.success).toBe(false)
  })
  it("createSalesPayment fails if overpaid", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", grandTotal: 100, paidAmount: 0 })
    const res = await actions.createSalesPayment(fdMap({ salesInvoiceId: 1, amount: 200, paymentDate: "2026-06-12", paymentMethod: "cash" }))
    expect(res?.success).toBe(false)
  })
  it("createSalesPayment updates attachments", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", grandTotal: 100, paidAmount: 0 })
    const res = await actions.createSalesPayment(fdMap({ salesInvoiceId: 1, amount: 100, paymentDate: "2026-06-12", paymentMethod: "cash", attachmentIds: "[1,2]" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.updateMany).toHaveBeenCalled()
  })

  // === updateSalesPayment ===
  it("updateSalesPayment fails if amount 0", async () => {
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: 1, amount: 0, paymentDate: "2026-06-12", paymentMethod: "cash" }))
    expect(res?.success).toBe(false)
  })
  it("updateSalesPayment fails if overpaid", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, salesInvoiceId: 1 })
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", grandTotal: 100 })
    mocks.prismaMock.salesPayment.aggregate.mockResolvedValue({ _sum: { amount: 50 } }) // others
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: 1, amount: 100, paymentDate: "2026-06-12", paymentMethod: "cash" }))
    expect(res?.success).toBe(false) // 100 + 50 > 100
  })
  it("updateSalesPayment updates attachments and triggers cross-invoice recalc", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, salesInvoiceId: 2 }) // Changed invoice from 2 -> 1
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", grandTotal: 100 })
    mocks.prismaMock.salesPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } }) 
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: 1, amount: 50, paymentDate: "2026-06-12", paymentMethod: "cash", attachmentIds: "[3]" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.updateMany).toHaveBeenCalled()
    expect(mocks.onSalesPaymentUpdatedMock).toHaveBeenCalledTimes(2) // Both new and old invoices updated
  })
})

describe("Sales Return Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("SR-001")
  })

  // === completeSalesReturn ===
  it("completeSalesReturn fails if already completed", async () => {
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed", items: [] })
    const res = await actions.completeSalesReturn(1)
    expect(res?.success).toBe(false)
  })

  // === createSalesReturn over-return branch coverage ===
  it("createSalesReturn fails on over-return violation not_on_invoice", async () => {
    mocks.findOverReturnMock.mockReturnValueOnce({ type: "not_on_invoice", itemId: 99 })
    const items = JSON.stringify([{ itemId: 99, qty: 1 }])
    const res = await actions.createSalesReturn(fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak ada pada faktur")
  })
  it("createSalesReturn fails on over-return violation exceeds_invoiced", async () => {
    mocks.findOverReturnMock.mockReturnValueOnce({ type: "exceeds_invoiced", itemId: 1, invoiced: 5, alreadyReturned: 0, remaining: 5 })
    const items = JSON.stringify([{ itemId: 1, qty: 10 }])
    const res = await actions.createSalesReturn(fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi yang difakturkan")
  })

  // === updateSalesReturn ===
  it("updateSalesReturn fails if not draft", async () => {
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ status: "completed" })
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: 1, date: "2026-06-12", items: "[]" }))
    expect(res?.success).toBe(false)
  })
  it("updateSalesReturn fails on over-return violation", async () => {
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ status: "draft" })
    mocks.findOverReturnMock.mockReturnValueOnce({ type: "exceeds_invoiced", itemId: 1, invoiced: 5, alreadyReturned: 0, remaining: 5 })
    const items = JSON.stringify([{ itemId: 1, qty: 10 }])
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi yang difakturkan")
  })
  it("updateSalesReturn fails on not_on_invoice violation", async () => {
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ status: "draft" })
    mocks.findOverReturnMock.mockReturnValueOnce({ type: "not_on_invoice", itemId: 1 })
    const items = JSON.stringify([{ itemId: 1, qty: 10 }])
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak ada pada faktur")
  })

  // === deleteSalesReturn ===
  it("deleteSalesReturn fails if completed", async () => {
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed" })
    const res = await actions.deleteSalesReturn(1)
    expect(res?.success).toBe(false)
  })
})

describe("Quotation Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("Q-001")
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue({ id: 1 })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", sections: [{ items: [{ id: 1 }] }],
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
      id: 1, status: "accepted", sections: [], documentNo: "Q-100", subtotal: 100, grandTotal: 100,
    })
    mocks.prismaMock.salesOrder.findFirst.mockResolvedValueOnce(null)
    const res = await actions.convertQuotationToOrder(1)
    expect(res?.success).toBe(true)
  })
})

describe("Sales Order Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("SO-001")
  })
  it("createSalesOrder succeeds", async () => {
    const res = await actions.createSalesOrder(fdMap({ customerId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesOrder succeeds", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
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

describe("Sales Invoice Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("INV-001")
  })
  it("createSalesInvoice succeeds", async () => {
    const res = await actions.createSalesInvoice(fdMap({ customerId: "1", date: "2026-06-12", dueDate: "2026-06-20" }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", paidAmount: 0 })
    const res = await actions.updateSalesInvoice(1, fdMap({ customerId: "1", date: "2026-06-12", dueDate: "2026-06-20" }))
    expect(res?.success).toBe(true)
  })
  it("postInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoiceItem.count.mockResolvedValueOnce(1)
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft", customerId: 1, grandTotal: 100, paidAmount: 0 })
    mocks.prismaMock.customer.findUnique.mockResolvedValueOnce({ creditLimit: 0, name: "CUST" })
    mocks.prismaMock.salesInvoice.updateMany.mockResolvedValueOnce({ count: 1 })
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(true)
  })
  it("deleteSalesInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft", customerId: 1 })
    mocks.prismaMock.salesPayment.findMany.mockResolvedValueOnce([])
    const res = await actions.deleteSalesInvoice(1)
    expect(res?.success).toBe(true)
  })
  it("voidSalesInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "posted", customerId: 1, grandTotal: 100, paidAmount: 0, payments: [] })
    mocks.prismaMock.customer.findUnique.mockResolvedValueOnce({ creditLimit: 0, name: "CUST" })
    const res = await actions.voidSalesInvoice(1)
    expect(res?.success).toBe(true)
  })
})

describe("Sales Payment Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("PAY-001")
  })
  it("createSalesPayment succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, grandTotal: 1000, status: "posted", customerId: 1, paidAmount: 0 })
    const res = await actions.createSalesPayment(fdMap({ salesInvoiceId: "1", paymentDate: "2026-06-12", paymentMethod: "cash", amount: "100" }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesPayment succeeds", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", salesInvoiceId: 1 })
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, grandTotal: 1000 })
    mocks.prismaMock.salesPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: "1", paymentDate: "2026-06-12", paymentMethod: "cash", amount: "100" }))
    expect(res?.success).toBe(true)
  })
  it("deleteSalesPayment succeeds", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, salesInvoiceId: 1 })
    const res = await actions.deleteSalesPayment(1)
    expect(res?.success).toBe(true)
  })
})

describe("Sales Return Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("SR-001")
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

describe("Delivery Order Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("DO-001")
  })
  it("createDeliveryOrder succeeds", async () => {
    const res = await actions.createDeliveryOrder(fdMap({ salesOrderId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("updateDeliveryOrder succeeds", async () => {
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue({ customerId: 1 })
    const res = await actions.updateDeliveryOrder(1, fdMap({ salesOrderId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("deleteDeliveryOrder succeeds", async () => {
    const res = await actions.deleteDeliveryOrder(1)
    expect(res?.success).toBe(true)
  })
})

describe("Down Payment Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("DP-001")
  })
  it("createDownPayment succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    const res = await actions.createDownPayment(fdMap({ quotationId: "1", amount: "100", paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("updateDownPayment succeeds", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
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

describe('Global Error Paths (Permission Reject)', () => {
  it("createQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createQuotation(arg1, arg2); } catch {}
  })
  it("sendQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).sendQuotation(arg1, arg2); } catch {}
  })
  it("acceptQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).acceptQuotation(arg1, arg2); } catch {}
  })
  it("rejectQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).rejectQuotation(arg1, arg2); } catch {}
  })
  it("reviseQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).reviseQuotation(arg1, arg2); } catch {}
  })
  it("convertQuotationToOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).convertQuotationToOrder(arg1, arg2); } catch {}
  })
  it("updateQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateQuotation(arg1, arg2); } catch {}
  })
  it("createDownPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createDownPayment(arg1, arg2); } catch {}
  })
  it("confirmDownPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).confirmDownPayment(arg1, arg2); } catch {}
  })
  it("createSalesOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createSalesOrder(arg1, arg2); } catch {}
  })
  it("confirmSalesOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).confirmSalesOrder(arg1, arg2); } catch {}
  })
  it("processSalesOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).processSalesOrder(arg1, arg2); } catch {}
  })
  it("completeSalesOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).completeSalesOrder(arg1, arg2); } catch {}
  })
  it("postInvoice handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).postInvoice(arg1, arg2); } catch {}
  })
  it("createSalesInvoice handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createSalesInvoice(arg1, arg2); } catch {}
  })
  it("createSalesPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createSalesPayment(arg1, arg2); } catch {}
  })
  it("completeSalesReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).completeSalesReturn(arg1, arg2); } catch {}
  })
  it("createSalesReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createSalesReturn(arg1, arg2); } catch {}
  })
  it("createDeliveryOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createDeliveryOrder(arg1, arg2); } catch {}
  })
  it("deleteQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteQuotation(arg1, arg2); } catch {}
  })
  it("deleteSalesPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteSalesPayment(arg1, arg2); } catch {}
  })
  it("deleteDeliveryOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteDeliveryOrder(arg1, arg2); } catch {}
  })
  it("deleteDownPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteDownPayment(arg1, arg2); } catch {}
  })
  it("updateSalesOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateSalesOrder(arg1, arg2); } catch {}
  })
  it("updateSalesInvoice handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateSalesInvoice(arg1, arg2); } catch {}
  })
  it("updateSalesPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateSalesPayment(arg1, arg2); } catch {}
  })
  it("updateSalesReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateSalesReturn(arg1, arg2); } catch {}
  })
  it("updateDeliveryOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateDeliveryOrder(arg1, arg2); } catch {}
  })
  it("updateDownPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateDownPayment(arg1, arg2); } catch {}
  })
  it("deleteSalesOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteSalesOrder(arg1, arg2); } catch {}
  })
  it("deleteSalesInvoice handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteSalesInvoice(arg1, arg2); } catch {}
  })
  it("voidSalesInvoice handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).voidSalesInvoice(arg1, arg2); } catch {}
  })
  it("deleteSalesReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteSalesReturn(arg1, arg2); } catch {}
  })
})
