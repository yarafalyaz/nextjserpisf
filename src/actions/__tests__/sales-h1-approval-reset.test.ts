import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModel = () => ({
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

  const prismaMock: Record<string, any> = {
    quotation: buildModel(),
    quotationSection: buildModel(),
    quotationItem: buildModel(),
    salesOrder: buildModel(),
    salesOrderItem: buildModel(),
    salesInvoice: buildModel(),
    salesInvoiceItem: buildModel(),
    deliveryOrderItem: buildModel(),
    customer: buildModel(),
    customerVehicle: buildModel(),
    item: buildModel(),
    approval: buildModel(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }
  prismaMock.$transaction = vi.fn(async (cb: any) =>
    typeof cb === "function" ? cb(prismaMock) : Promise.all(cb),
  )

  return {
    prismaMock,
    requirePermissionMock: vi.fn(),
    requestApprovalMock: vi.fn(),
    assertApprovedMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  reportPostCommitAuditFailure: vi.fn(),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("DOC-001"),
}))
vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { next: () => Promise.resolve(1) },
}))
vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: vi.fn().mockResolvedValue("slug-1"),
  nextSlugWithClient: vi.fn().mockResolvedValue("slug-1"),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: (...a: unknown[]) => mocks.requestApprovalMock(...a),
  assertApproved: (...a: unknown[]) => mocks.assertApprovedMock(...a),
}))
vi.mock("@/lib/services/quotation-sync.service", () => ({
  resyncOnEdit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/sales-settlement.service", () => ({
  DOWN_PAYMENT_METHOD: "down_payment",
  hasRealSettlement: vi.fn().mockResolvedValue(false),
  salesOrderHasRealSettlement: vi.fn().mockResolvedValue(false),
  quotationHasRealSettlement: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/services/vehicle-fitment.service", () => ({
  stampQuotationFitmentSnapshot: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(),
  onSalesPaymentCreated: vi.fn(),
  onSalesReturnCompleted: vi.fn(),
  onDownPaymentReceived: vi.fn(),
  deleteJournalByReference: vi.fn(),
  deleteJournalByReferenceTx: vi.fn(),
  reverseJournalsByReferenceTx: vi.fn(),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(),
  onSalesPaymentUpdated: vi.fn(),
  onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/credit-gate.service", () => ({
  assessCreditGateInTx: vi.fn().mockResolvedValue({ allowed: true }),
  assertCreditGatePassed: vi.fn().mockReturnValue(null),
  consumeApprovedCreditOverrideInTx: vi.fn(),
  creditGateBlockedResult: vi.fn().mockReturnValue(null),
}))

import { updateQuotation, updateSalesOrder, updateSalesInvoice } from "../sales.actions"

function fd(entries: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
  mocks.requestApprovalMock.mockResolvedValue(true)
  mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({
    id: 1,
    documentNo: "SO-001",
    status: "draft",
    customerId: 1,
    quotationId: null,
    grandTotal: 1000,
  })
  mocks.prismaMock.salesOrder.update.mockResolvedValue({ id: 1, items: [] })
  mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({
    id: 1,
    documentNo: "INV-001",
    status: "draft",
    customerId: 1,
    salesOrderId: null,
    quotationId: null,
    grandTotal: 1000,
    paidAmount: 0,
    commissionSnapshot: null,
  })
  mocks.prismaMock.salesInvoice.update.mockResolvedValue({ id: 1, items: [] })
  mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({
    id: 1,
    documentNo: "QUO-001",
    status: "draft",
    customerId: 1,
  })
  mocks.prismaMock.quotation.findUnique.mockResolvedValue({ status: "draft" })
  mocks.prismaMock.quotation.update.mockResolvedValue({ id: 1 })
})

describe("H1: draft edit memicu reset approval dalam tx", () => {
  it("updateSalesOrder memanggil requestApprovalIfConfigured saat approval sudah ada, dan tidak saat belum pernah diajukan", async () => {
    mocks.prismaMock.approval.findFirst.mockResolvedValueOnce(null)
    const noApprovalRes = await updateSalesOrder(1, fd({ customerId: "1", date: "2026-06-12" }))
    expect(noApprovalRes.success).toBe(true)
    expect(mocks.requestApprovalMock).not.toHaveBeenCalled()

    mocks.prismaMock.approval.findFirst.mockResolvedValueOnce({ id: 9 })
    const withApprovalRes = await updateSalesOrder(1, fd({ customerId: "1", date: "2026-06-12" }))
    expect(withApprovalRes.success).toBe(true)
    expect(mocks.requestApprovalMock).toHaveBeenCalledWith("SalesOrder", 1, 7, mocks.prismaMock)
  })

  it("updateQuotation memanggil requestApprovalIfConfigured saat approval sudah ada", async () => {
    mocks.prismaMock.approval.findFirst.mockResolvedValueOnce({ id: 11 })
    const res = await updateQuotation(
      1,
      fd({ data: JSON.stringify({ customerId: 1, sections: [], discount: 0, tax: 0 }) }),
    )
    expect(res.success).toBe(true)
    expect(mocks.requestApprovalMock).toHaveBeenCalledWith("Quotation", 1, 7, mocks.prismaMock)
  })

  it("updateSalesInvoice memanggil requestApprovalIfConfigured di dalam tx", async () => {
    const res = await updateSalesInvoice(1, fd({ customerId: "1", date: "2026-06-12" }))
    expect(res.success).toBe(true)
    expect(mocks.requestApprovalMock).toHaveBeenCalledWith("SalesInvoice", 1, 7, mocks.prismaMock)
  })
})
