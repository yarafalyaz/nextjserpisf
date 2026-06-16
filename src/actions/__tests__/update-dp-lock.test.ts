import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the updateDownPayment TOCTOU race fix. Previously the
// edit path summed sibling down payments OUTSIDE any transaction/row lock, so
// two concurrent edits on the same quotation could each pass the cumulative
// cap and together over-pay the quotation grandTotal. The fix runs the
// SELECT ... FOR UPDATE lock + aggregate inside a $transaction. A mocked Prisma
// can't enforce real locking, so we assert the lock query is issued BEFORE the
// aggregate and that both run inside the transaction callback.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const transactionMock = vi.fn()

const quotationFindUniqueOrThrowMock = vi.fn()
const dpFindUniqueOrThrowMock = vi.fn()
const txExecuteRawMock = vi.fn()
const dpAggregateMock = vi.fn()
const dpUpdateMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: { findUniqueOrThrow: (...a: unknown[]) => quotationFindUniqueOrThrowMock(...a) },
    downPayment: {
      findUniqueOrThrow: (...a: unknown[]) => dpFindUniqueOrThrowMock(...a),
      update: (...a: unknown[]) => dpUpdateMock(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(), onSalesPaymentCreated: vi.fn(), onSalesReturnCompleted: vi.fn(),
  onDownPaymentReceived: vi.fn(), deleteJournalByReference: vi.fn(), deleteJournalByReferenceTx: vi.fn(),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(), onSalesPaymentUpdated: vi.fn(), onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: (...a: unknown[]) => logActivityMock(...a) }))

import { updateDownPayment } from "../sales.actions"

function wireTransaction() {
  const tx = {
    $executeRaw: txExecuteRawMock,
    downPayment: { aggregate: dpAggregateMock, update: dpUpdateMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, transactionMock,
    quotationFindUniqueOrThrowMock, dpFindUniqueOrThrowMock,
    txExecuteRawMock, dpAggregateMock, dpUpdateMock,
  ]) m.mockReset()

  requirePermissionMock.mockResolvedValue({ id: 1 })
  dpFindUniqueOrThrowMock.mockResolvedValue({ id: 99, status: "draft" })
  quotationFindUniqueOrThrowMock.mockResolvedValue({ id: 50, status: "accepted", customerId: 3, grandTotal: 1000 })
  txExecuteRawMock.mockResolvedValue(1)
  dpAggregateMock.mockResolvedValue({ _sum: { amount: 200 } })
  dpUpdateMock.mockResolvedValue({ id: 99 })
  wireTransaction()
})

function buildForm(amount: string) {
  const form = new FormData()
  form.append("quotationId", "50")
  form.append("amount", amount)
  form.append("paymentDate", "2024-01-01")
  return form
}

describe("updateDownPayment concurrency guard", () => {
  it("locks the quotation row BEFORE summing sibling down payments", async () => {
    const order: string[] = []
    txExecuteRawMock.mockImplementation(() => { order.push("lock"); return Promise.resolve(1) })
    dpAggregateMock.mockImplementation(() => { order.push("aggregate"); return Promise.resolve({ _sum: { amount: 200 } }) })

    const result = await updateDownPayment(99, buildForm("500"))

    expect(result.success).toBe(true)
    expect(transactionMock).toHaveBeenCalled()       // cap runs inside a tx
    expect(txExecuteRawMock).toHaveBeenCalled()       // FOR UPDATE lock taken
    expect(order).toEqual(["lock", "aggregate"])      // lock strictly precedes the check
  })

  it("rejects when the cumulative DP total would exceed the quotation grandTotal", async () => {
    dpAggregateMock.mockResolvedValue({ _sum: { amount: 800 } })
    const result = await updateDownPayment(99, buildForm("500")) // 800 + 500 > 1000
    expect(result.success).toBe(false)
    expect(result.error).toContain("Total DP melebihi")
    expect(dpUpdateMock).not.toHaveBeenCalled()
  })
})
