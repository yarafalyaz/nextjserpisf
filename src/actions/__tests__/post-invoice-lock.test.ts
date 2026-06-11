import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the postInvoice race fix. Two concurrent posts could both
// pass the in-memory `status !== "draft"` guard and each call onSalesInvoicePosted
// → double GL posting + double StockMove OUT. The fix is an atomic conditional
// claim: updateMany WHERE status="draft"; only the winner (count===1) proceeds,
// the loser (count===0) throws before the accounting hook runs. A mocked Prisma
// can't prove DB atomicity, but it CAN durably assert the claim shape + that a
// lost claim aborts before posting.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const onSalesInvoicePostedMock = vi.fn()

const invoiceFindUniqueOrThrowMock = vi.fn()
const invoiceItemCountMock = vi.fn()
const invoiceUpdateManyMock = vi.fn()
const customerFindUniqueMock = vi.fn()
const invoiceAggregateMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => {
  const mockPrisma = {
    $transaction: vi.fn((cb) => cb(mockPrisma)),
    salesInvoice: {
      findUniqueOrThrow: (...a: unknown[]) => invoiceFindUniqueOrThrowMock(...a),
      updateMany: (...a: unknown[]) => invoiceUpdateManyMock(...a),
      aggregate: (...a: unknown[]) => invoiceAggregateMock(...a),
    },
    salesInvoiceItem: { count: (...a: unknown[]) => invoiceItemCountMock(...a) },
    customer: { findUnique: (...a: unknown[]) => customerFindUniqueMock(...a) },
  }
  return { prisma: mockPrisma }
})
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: (...a: unknown[]) => onSalesInvoicePostedMock(...a),
  onSalesPaymentCreated: vi.fn(),
  onSalesReturnCompleted: vi.fn(),
  onDownPaymentReceived: vi.fn(),
  deleteJournalByReference: vi.fn(),
  deleteJournalByReferenceTx: vi.fn(),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(), onSalesPaymentUpdated: vi.fn(), onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn(async () => "INV-0001") }))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: (...a: unknown[]) => logActivityMock(...a) }))
vi.mock("@/lib/sales/return-validation", () => ({ findOverReturn: vi.fn(() => null) }))

import { postInvoice } from "../sales.actions"

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, onSalesInvoicePostedMock,
    invoiceFindUniqueOrThrowMock, invoiceItemCountMock, invoiceUpdateManyMock,
    customerFindUniqueMock, invoiceAggregateMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 3 })
  invoiceFindUniqueOrThrowMock.mockResolvedValue({
    id: 11, status: "draft", customerId: 8, grandTotal: 1000, paidAmount: 0,
  })
  invoiceItemCountMock.mockResolvedValue(2)
  customerFindUniqueMock.mockResolvedValue({ creditLimit: 0, name: "PT X" }) // 0 = no limit
  invoiceUpdateManyMock.mockResolvedValue({ count: 1 })
  onSalesInvoicePostedMock.mockResolvedValue(undefined)
})

describe("postInvoice concurrency guard", () => {
  it("posts via an atomic conditional claim scoped to status=draft", async () => {
    const result = await postInvoice(11)

    expect(result.success).toBe(true)
    expect(invoiceUpdateManyMock).toHaveBeenCalledTimes(1)
    const claimArg = invoiceUpdateManyMock.mock.calls[0][0]
    expect(claimArg.where.id).toBe(11)
    expect(claimArg.where.status).toBe("draft")
    expect(claimArg.data.status).toBe("posted")
    expect(onSalesInvoicePostedMock).toHaveBeenCalledTimes(1)
  })

  it("aborts WITHOUT posting the accounting hook when the claim is lost (count===0)", async () => {
    invoiceUpdateManyMock.mockResolvedValue({ count: 0 }) // another request won the race

    const result = await postInvoice(11)

    expect(result.success).toBe(false)
    expect(onSalesInvoicePostedMock).not.toHaveBeenCalled() // no double GL / StockMove
  })

  it("refuses posting an invoice that is not in draft", async () => {
    invoiceFindUniqueOrThrowMock.mockResolvedValue({
      id: 11, status: "posted", customerId: 8, grandTotal: 1000, paidAmount: 0,
    })

    const result = await postInvoice(11)

    expect(result.success).toBe(false)
    expect(invoiceUpdateManyMock).not.toHaveBeenCalled()
    expect(onSalesInvoicePostedMock).not.toHaveBeenCalled()
  })
})
