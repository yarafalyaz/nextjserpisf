import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * TASK-016 regresi sisi jual (gagal di kode lama):
 * - BUG-03: DO 7+7 atas SO 10 — yang kedua ditolak (create dan klaim ship).
 * - BUG-06: faktur kedua melebihi SO ditolak di create dan di post,
 *   termasuk baris jasa (itemId null) lewat cap nilai.
 * - BUG-10: DO shipped tidak bisa diedit / dipindah SO; SO tujuan digerbang
 *   status sama seperti create.
 */

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
    aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0, grandTotal: 0, paidAmount: 0 } }),
  })

  const prismaMock = {
    quotation: buildModelMock(),
    quotationSection: buildModelMock(),
    quotationItem: buildModelMock(),
    quotationHistory: buildModelMock(),
    customerVehicle: buildModelMock(),
    customer: buildModelMock(),
    customerPriceList: buildModelMock(),
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
    approvalWorkflow: buildModelMock(),
    approval: buildModelMock(),
    uomConversion: buildModelMock(),
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock: vi.fn(),
    onSalesInvoicePostedMock: vi.fn(),
    prismaMock,
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/utils/error", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/error")>()
  return { ...actual, isNextRedirectError: () => false }
})
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: vi.fn(),
  reportPostCommitAuditFailure: vi.fn().mockResolvedValue({ auditPersisted: true }),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn(async (p: string) => `${p}-001`),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))
vi.mock("@/lib/services/notification.service", () => ({
  notificationService: { notifyAdmins: vi.fn(), notifyUser: vi.fn(), notifyRole: vi.fn() },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: (...a: unknown[]) => mocks.onSalesInvoicePostedMock(...a),
  onSalesPaymentCreated: vi.fn(),
  onSalesReturnCompleted: vi.fn(),
  onDownPaymentReceived: vi.fn(),
  deleteJournalByReference: vi.fn(),
  deleteJournalByReferenceTx: vi.fn(),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(),
  onSalesPaymentUpdated: vi.fn(),
  onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/services/sales-settlement.service", () => ({
  DOWN_PAYMENT_METHOD: "down_payment",
  hasRealSettlement: vi.fn().mockResolvedValue(false),
  salesOrderHasRealSettlement: vi.fn().mockResolvedValue(false),
  quotationHasRealSettlement: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/services/sales-invoice-posting.service", () => ({
  reverseSalesInvoicePostingTx: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/sales/return-validation", () => ({ findOverReturn: vi.fn().mockReturnValue(null) }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/warranty-journal.service", () => ({
  assertInvoiceAllowedForWorkOrderBridges: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn().mockResolvedValue(undefined),
  assertApproved: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/customer-price-list.service", () => ({
  loadPriceListRows: vi.fn().mockResolvedValue({ customerCategoryId: null, rows: [] }),
  pickPriceListRow: vi.fn().mockReturnValue(null),
  resolveLinePricing: vi.fn((x: any) => x),
}))
vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}))

import * as actions from "../sales.actions"

function fdMap(payload: Record<string, string | number>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, String(v))
  return f
}

const SO = { id: 1, documentNo: "SO-001", status: "confirmed", customerId: 7, grandTotal: 1000, salesEmployeeId: null, quotationId: null }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 3 })
  mocks.prismaMock.$transaction.mockImplementation(async (ops: any) => {
    if (typeof ops === "function") return ops(mocks.prismaMock)
    return Promise.all(ops)
  })
})

describe("BUG-03 createDeliveryOrder: cap kumulatif per baris SO", () => {
  beforeEach(() => {
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue(SO)
    mocks.prismaMock.salesOrderItem.findMany.mockResolvedValue([{ id: 11, itemId: 5, qty: 10 }])
    mocks.prismaMock.deliveryOrder.create.mockResolvedValue({ id: 99 })
  })

  it("DO kedua 7 ditolak: sudah terkirim 7 dari SO qty 10", async () => {
    mocks.prismaMock.deliveryOrderItem.findMany.mockResolvedValue([{ salesOrderItemId: 11, qty: 7 }])
    const res = await actions.createDeliveryOrder(
      fdMap({ salesOrderId: 1, date: "2026-06-12", items: JSON.stringify([{ salesOrderItemId: 11, itemId: 5, qty: 7 }]) }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi pesanan")
    expect(mocks.prismaMock.deliveryOrder.create).not.toHaveBeenCalled()
  })

  it("DO 3 masih lolos: 7 terkirim + 3 = pas 10", async () => {
    mocks.prismaMock.deliveryOrderItem.findMany.mockResolvedValue([{ salesOrderItemId: 11, qty: 7 }])
    const res = await actions.createDeliveryOrder(
      fdMap({ salesOrderId: 1, date: "2026-06-12", items: JSON.stringify([{ salesOrderItemId: 11, itemId: 5, qty: 3 }]) }),
    )
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.deliveryOrder.create).toHaveBeenCalled()
  })
})

describe("BUG-03 shipDeliveryOrder: cap ditegakkan saat klaim kirim", () => {
  beforeEach(() => {
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "draft", documentNo: "DO-1", salesOrderId: 1 })
    mocks.prismaMock.deliveryOrderItem.count.mockResolvedValue(1)
    mocks.prismaMock.deliveryOrder.updateMany.mockResolvedValue({ count: 1 })
    mocks.prismaMock.salesOrderItem.findMany.mockResolvedValue([{ id: 11, qty: 10 }])
  })

  it("ship DO 7 kedua ditolak: shipped lain sudah 7 dari 10", async () => {
    mocks.prismaMock.deliveryOrderItem.findMany.mockImplementation(async (args: any) =>
      args?.where?.deliveryOrderId === 9
        ? [{ salesOrderItemId: 11, itemId: 5, qty: 7, unit: null }]
        : [{ salesOrderItemId: 11, qty: 7 }],
    )
    const res = await actions.shipDeliveryOrder(9)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi pesanan")
    expect(mocks.prismaMock.deliveryOrder.updateMany).not.toHaveBeenCalled()
  })

  it("ship lolos bila shipped lain baru 3 (3 + 7 = 10)", async () => {
    mocks.prismaMock.deliveryOrderItem.findMany.mockImplementation(async (args: any) =>
      args?.where?.deliveryOrderId === 9
        ? [{ salesOrderItemId: 11, itemId: 5, qty: 7, unit: null }]
        : [{ salesOrderItemId: 11, qty: 3 }],
    )
    const res = await actions.shipDeliveryOrder(9)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.deliveryOrder.updateMany).toHaveBeenCalled()
  })
})

describe("BUG-06 createSalesInvoice: cap kumulatif terhadap SO", () => {
  beforeEach(() => {
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue(SO)
    mocks.prismaMock.salesOrderItem.findMany.mockResolvedValue([{ itemId: 11, qty: 10 }])
    mocks.prismaMock.salesInvoice.create.mockResolvedValue({ id: 77 })
  })

  it("faktur kedua menembus nilai SO ditolak (800 tertagih + 400 > 1000)", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 50, status: "posted", grandTotal: 800, items: [{ itemId: 11, qty: 2, uom: null }] },
    ])
    const res = await actions.createSalesInvoice(
      fdMap({ customerId: 7, date: "2026-06-12", salesOrderId: 1, items: JSON.stringify([{ itemId: 11, qty: 4, unitPrice: 100 }]) }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi")
    expect(mocks.prismaMock.salesInvoice.create).not.toHaveBeenCalled()
  })

  it("qty kumulatif menembus SO ditolak walau nilai masih muat (7+4 > 10)", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 50, status: "posted", grandTotal: 700, items: [{ itemId: 11, qty: 7, uom: null }] },
    ])
    const res = await actions.createSalesInvoice(
      fdMap({ customerId: 7, date: "2026-06-12", salesOrderId: 1, items: JSON.stringify([{ itemId: 11, qty: 4, unitPrice: 50 }]) }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi")
    expect(mocks.prismaMock.salesInvoice.create).not.toHaveBeenCalled()
  })

  it("faktur jasa (itemId null) tetap tertahan cap nilai", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 50, status: "posted", grandTotal: 800, items: [] },
    ])
    const res = await actions.createSalesInvoice(
      fdMap({ customerId: 7, date: "2026-06-12", salesOrderId: 1, items: JSON.stringify([{ itemId: null, qty: 1, unitPrice: 300 }]) }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi")
    expect(mocks.prismaMock.salesInvoice.create).not.toHaveBeenCalled()
  })

  it("faktur dalam sisa SO lolos (800 + 200 = 1000)", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 50, status: "posted", grandTotal: 800, items: [{ itemId: 11, qty: 2, uom: null }] },
    ])
    const res = await actions.createSalesInvoice(
      fdMap({ customerId: 7, date: "2026-06-12", salesOrderId: 1, items: JSON.stringify([{ itemId: 11, qty: 2, unitPrice: 100 }]) }),
    )
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.salesInvoice.create).toHaveBeenCalled()
  })
})

describe("BUG-06 postInvoice: posting kedua melebihi SO ditolak sebelum hook", () => {
  beforeEach(() => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({
      id: 21, status: "draft", salesOrderId: 1, quotationId: null, projectId: null, grandTotal: 400, customerId: 7, paidAmount: 0,
    })
    mocks.prismaMock.salesInvoiceItem.count.mockResolvedValue(1)
    mocks.prismaMock.salesInvoiceItem.findMany.mockResolvedValue([{ itemId: 11, qty: 2, uom: null }])
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue(SO)
    mocks.prismaMock.salesOrderItem.findMany.mockResolvedValue([{ itemId: 11, qty: 10 }])
    mocks.prismaMock.salesInvoice.updateMany.mockResolvedValue({ count: 1 })
  })

  it("posting ditolak bila faktur lain sudah menagih 800 dari SO 1000", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 50, status: "posted", grandTotal: 800, items: [{ itemId: 11, qty: 7, uom: null }] },
    ])
    const res = await actions.postInvoice(21)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi")
    expect(mocks.prismaMock.salesInvoice.updateMany).not.toHaveBeenCalled()
    expect(mocks.onSalesInvoicePostedMock).not.toHaveBeenCalled()
  })

  it("posting lolos bila total tertagih masih di dalam SO", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 50, status: "posted", grandTotal: 500, items: [{ itemId: 11, qty: 7, uom: null }] },
    ])
    const res = await actions.postInvoice(21)
    expect(res?.success).toBe(true)
    expect(mocks.onSalesInvoicePostedMock).toHaveBeenCalled()
  })
})

describe("BUG-10 updateDeliveryOrder: gerbang status", () => {
  it("DO shipped tidak bisa diedit", async () => {
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "shipped", documentNo: "DO-1", salesOrderId: 1 })
    const res = await actions.updateDeliveryOrder(5, fdMap({ salesOrderId: 1, date: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak dapat diubah")
    expect(mocks.prismaMock.deliveryOrder.update).not.toHaveBeenCalled()
  })

  it("DO delivered tidak bisa dipindah ke SO lain", async () => {
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "delivered", documentNo: "DO-1", salesOrderId: 1 })
    const res = await actions.updateDeliveryOrder(5, fdMap({ salesOrderId: 2, date: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.deliveryOrder.update).not.toHaveBeenCalled()
  })

  it("pindah ke SO konsep ditolak sama seperti create", async () => {
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "draft", documentNo: "DO-1", salesOrderId: 1 })
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue({ customerId: 7, status: "draft", documentNo: "SO-2" })
    const res = await actions.updateDeliveryOrder(5, fdMap({ salesOrderId: 2, date: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Surat jalan hanya bisa")
    expect(mocks.prismaMock.deliveryOrder.update).not.toHaveBeenCalled()
  })

  it("edit draft ke SO sah tetap lolos", async () => {
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "draft", documentNo: "DO-1", salesOrderId: 1 })
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue({ customerId: 7, status: "confirmed", documentNo: "SO-1" })
    mocks.prismaMock.deliveryOrder.update.mockResolvedValue({ id: 5 })
    const res = await actions.updateDeliveryOrder(5, fdMap({ salesOrderId: 1, date: "2026-06-12" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.deliveryOrder.update).toHaveBeenCalled()
  })
})
