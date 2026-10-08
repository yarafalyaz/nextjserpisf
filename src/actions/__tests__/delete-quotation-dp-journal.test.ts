import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the deleteQuotation orphaned-DP-journal bug.
// deleteQuotation cascades a quotation delete, which also deletes its
// DownPayment rows. Before the fix it deleted the rows WITHOUT reversing the
// GL journal of each DP (deleteJournalByReferenceTx), leaving the DP journal
// (Dr Bank / Cr Down Payment liability) stranded in the GL forever.
// This test asserts every DP id gets its journal reversed before the rows go.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const transactionMock = vi.fn()
const deleteJournalByReferenceTxMock = vi.fn()

const quotationFindUniqueOrThrowMock = vi.fn()

const txSalesOrderFindManyMock = vi.fn()
const txSalesInvoiceFindManyMock = vi.fn()
const txSalesPaymentDeleteManyMock = vi.fn()
const txSalesInvoiceItemDeleteManyMock = vi.fn()
const txSalesInvoiceDeleteManyMock = vi.fn()
const txDeliveryOrderDeleteManyMock = vi.fn()
const txSalesOrderItemDeleteManyMock = vi.fn()
const txSalesOrderDeleteManyMock = vi.fn()
const txWorkOrderFindManyMock = vi.fn()
const txWorkOrderItemDeleteManyMock = vi.fn()
const txWorkOrderDeleteManyMock = vi.fn()
const txProjectDeleteManyMock = vi.fn()
const txDownPaymentFindManyMock = vi.fn()
const txDownPaymentDeleteManyMock = vi.fn()
const txQuotationSectionFindManyMock = vi.fn()
const txQuotationItemDeleteManyMock = vi.fn()
const txQuotationSectionDeleteManyMock = vi.fn()
const txQuotationDeleteMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: { findUniqueOrThrow: (...a: unknown[]) => quotationFindUniqueOrThrowMock(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(),
  onSalesPaymentCreated: vi.fn(),
  onSalesReturnCompleted: vi.fn(),
  onDownPaymentReceived: vi.fn(),
  deleteJournalByReference: vi.fn(),
  deleteJournalByReferenceTx: (...a: unknown[]) => deleteJournalByReferenceTxMock(...a),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(), onSalesPaymentUpdated: vi.fn(), onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn(async () => "X-1") }))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))

import { deleteQuotation } from "../sales.actions"

function wireTransaction() {
  const tx = {
    salesOrder: { findMany: txSalesOrderFindManyMock, deleteMany: txSalesOrderDeleteManyMock, item: { deleteMany: txSalesOrderItemDeleteManyMock } },
    salesInvoice: { findMany: txSalesInvoiceFindManyMock, deleteMany: txSalesInvoiceDeleteManyMock },
    salesPayment: { deleteMany: txSalesPaymentDeleteManyMock },
    salesInvoiceItem: { deleteMany: txSalesInvoiceItemDeleteManyMock },
    deliveryOrder: { deleteMany: txDeliveryOrderDeleteManyMock },
    salesOrderItem: { deleteMany: txSalesOrderItemDeleteManyMock },
    workOrder: { findMany: txWorkOrderFindManyMock, deleteMany: txWorkOrderDeleteManyMock },
    workOrderItem: { deleteMany: txWorkOrderItemDeleteManyMock },
    project: { deleteMany: txProjectDeleteManyMock },
    downPayment: { findMany: txDownPaymentFindManyMock, deleteMany: txDownPaymentDeleteManyMock },
    quotationSection: { findMany: txQuotationSectionFindManyMock, deleteMany: txQuotationSectionDeleteManyMock },
    quotationItem: { deleteMany: txQuotationItemDeleteManyMock },
    quotation: { delete: txQuotationDeleteMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, transactionMock,
    deleteJournalByReferenceTxMock, quotationFindUniqueOrThrowMock,
    txSalesOrderFindManyMock, txSalesInvoiceFindManyMock, txSalesPaymentDeleteManyMock,
    txSalesInvoiceItemDeleteManyMock, txSalesInvoiceDeleteManyMock, txDeliveryOrderDeleteManyMock,
    txSalesOrderItemDeleteManyMock, txSalesOrderDeleteManyMock, txWorkOrderFindManyMock,
    txWorkOrderItemDeleteManyMock, txWorkOrderDeleteManyMock, txProjectDeleteManyMock,
    txDownPaymentFindManyMock, txDownPaymentDeleteManyMock, txQuotationSectionFindManyMock,
    txQuotationItemDeleteManyMock, txQuotationSectionDeleteManyMock, txQuotationDeleteMock,
  ]) m.mockReset()

  requirePermissionMock.mockResolvedValue({ id: 1 })
  quotationFindUniqueOrThrowMock.mockResolvedValue({ id: 5 })
  txSalesOrderFindManyMock.mockResolvedValue([])
  txSalesInvoiceFindManyMock.mockResolvedValue([])
  txWorkOrderFindManyMock.mockResolvedValue([])
  txDownPaymentFindManyMock.mockResolvedValue([{ id: 71 }, { id: 72 }])
  txQuotationSectionFindManyMock.mockResolvedValue([])
  deleteJournalByReferenceTxMock.mockResolvedValue(undefined)
  wireTransaction()
})

describe("deleteQuotation reverses Down Payment journals", () => {
  it("calls deleteJournalByReferenceTx for every linked DownPayment before deleting", async () => {
    const result = await deleteQuotation(5)

    expect(result.success).toBe(true)
    // One reversal per DP, with the correct reference type + id.
    expect(deleteJournalByReferenceTxMock).toHaveBeenCalledTimes(2)
    expect(deleteJournalByReferenceTxMock).toHaveBeenCalledWith(expect.anything(), "DownPayment", 71)
    expect(deleteJournalByReferenceTxMock).toHaveBeenCalledWith(expect.anything(), "DownPayment", 72)
    expect(txDownPaymentDeleteManyMock).toHaveBeenCalledWith({ where: { quotationId: 5 } })
  })

  it("does not call the reversal when the quotation has no down payments", async () => {
    txDownPaymentFindManyMock.mockResolvedValue([])

    const result = await deleteQuotation(5)

    expect(result.success).toBe(true)
    expect(deleteJournalByReferenceTxMock).not.toHaveBeenCalled()
    expect(txDownPaymentDeleteManyMock).toHaveBeenCalled()
  })
})
