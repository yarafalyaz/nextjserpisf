import { describe, it, expect, vi, beforeEach } from "vitest"

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const deleteJournalByRefMock = vi.fn()
const onPaymentCreatedMock = vi.fn()
const onPaymentUpdatedMock = vi.fn()
const transactionMock = vi.fn()

const paymentFindUniqueOrThrowMock = vi.fn()
const paymentUpdateMock = vi.fn()
const paymentAggregateMock = vi.fn()
const invoiceFindUniqueOrThrowMock = vi.fn()
const execRawMock = vi.fn()
const attachmentUpdateManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesPayment: { findUniqueOrThrow: (...a: unknown[]) => paymentFindUniqueOrThrowMock(...a) },
    transactionAttachment: { updateMany: (...a: unknown[]) => attachmentUpdateManyMock(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(), onSalesPaymentCreated: (...a: unknown[]) => onPaymentCreatedMock(...a),
  onSalesReturnCompleted: vi.fn(), onDownPaymentReceived: vi.fn(),
  deleteJournalByReference: (...a: unknown[]) => deleteJournalByRefMock(...a),
  deleteJournalByReferenceTx: vi.fn(),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: (...a: unknown[]) => onPaymentCreatedMock(...a),
  onSalesPaymentUpdated: (...a: unknown[]) => onPaymentUpdatedMock(...a),
  onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn(async () => "PAY-0001") }))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))

import { updateSalesPayment } from "../sales.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

function wireTransaction() {
  const tx = {
    $executeRaw: (...a: unknown[]) => execRawMock(...a),
    salesInvoice: { findUniqueOrThrow: (...a: unknown[]) => invoiceFindUniqueOrThrowMock(...a) },
    salesPayment: {
      aggregate: (...a: unknown[]) => paymentAggregateMock(...a),
      update: (...a: unknown[]) => paymentUpdateMock(...a),
    },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, deleteJournalByRefMock,
    onPaymentCreatedMock, onPaymentUpdatedMock, transactionMock,
    paymentFindUniqueOrThrowMock, paymentUpdateMock, paymentAggregateMock,
    invoiceFindUniqueOrThrowMock, execRawMock, attachmentUpdateManyMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  paymentFindUniqueOrThrowMock.mockResolvedValue({ salesInvoiceId: 50 })
  invoiceFindUniqueOrThrowMock.mockResolvedValue({ id: 50, grandTotal: 1000, customerId: 3 })
  paymentAggregateMock.mockResolvedValue({ _sum: { amount: 200 } }) // 200 already paid by others
  paymentUpdateMock.mockResolvedValue({ id: 9, salesInvoiceId: 50 })
  execRawMock.mockResolvedValue(undefined)
  wireTransaction()
})

describe("updateSalesPayment overpay guard", () => {
  it("rejects an edit that pushes total paid past grandTotal", async () => {
    // grandTotal 1000, others paid 200 → remaining 800. Editing this payment to
    // 900 would overpay.
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "900", paymentDate: "2026-06-09", paymentMethod: "cash",
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("melebihi sisa tagihan")
    expect(paymentUpdateMock).not.toHaveBeenCalled()
  })

  it("rejects a non-positive amount", async () => {
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "0", paymentDate: "2026-06-09", paymentMethod: "cash",
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("lebih dari 0")
  })

  it("allows an edit within the remaining balance and resyncs the GL", async () => {
    // remaining 800; editing to 800 is exactly allowed.
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "800", paymentDate: "2026-06-09", paymentMethod: "transfer",
    }))
    expect(result.success).toBe(true)
    expect(execRawMock).toHaveBeenCalled() // FOR UPDATE lock taken
    expect(paymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9 }, data: expect.objectContaining({ amount: 800 }) }),
    )
    // GL kept in sync: old cash journal reversed + reposted, invoice recalced.
    expect(deleteJournalByRefMock).toHaveBeenCalledWith("SalesPayment", 9)
    expect(onPaymentUpdatedMock).toHaveBeenCalled()
  })
})
