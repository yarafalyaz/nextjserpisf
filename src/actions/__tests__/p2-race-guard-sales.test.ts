import { describe, it, expect, vi, beforeEach } from "vitest"

// Falsification tests for P2 race fixes on the sales side:
// (3) createDownPayment / updateDownPayment — quotation status re-read INSIDE
//     the tx after FOR UPDATE (no outer read)
// (4) updateSalesPayment — BOTH invoices locked id-sorted up front; old row
//     read inside the tx, never outside.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const generateDocNumMock = vi.fn()
const nextSlugMock = vi.fn(async () => "test-slug")

const quotationFindUniqueOrThrowMock = vi.fn()
const dpFindUniqueOrThrowMock = vi.fn()
const dpAggregateMock = vi.fn()
const dpCreateMock = vi.fn()
const dpUpdateMock = vi.fn()
const paymentFindUniqueOrThrowMock = vi.fn()
const invoiceFindUniqueOrThrowMock = vi.fn()
const paymentAggregateMock = vi.fn()
const paymentUpdateMock = vi.fn()
const accountCountMock = vi.fn()
const txExecuteRawMock = vi.fn()
const transactionMock = vi.fn()
const onSalesPaymentCreatedMock = vi.fn()
const onSalesPaymentUpdatedMock = vi.fn()
const deleteJournalByReferenceTxMock = vi.fn()
const attachMock = vi.fn()

// Cabang delegasi salesPayment/salesInvoice/account yang sama untuk factory
// `vi.mock` prisma dan objek `tx` wirePaymentTx. Fungsi lokal biasa yang
// dipanggil di dalam factory — pola yang sama dengan delegasi inline
// sebelumnya, jadi tidak menyentuh hoisting vi.mock.
function paymentBranches() {
  return {
    journal: { findFirst: vi.fn().mockResolvedValue(null) },
    salesPayment: {
      findUniqueOrThrow: (...a: unknown[]) => paymentFindUniqueOrThrowMock(...a),
      aggregate: (...a: unknown[]) => paymentAggregateMock(...a),
      update: (...a: unknown[]) => paymentUpdateMock(...a),
    },
    salesInvoice: {
      findUniqueOrThrow: (...a: unknown[]) => invoiceFindUniqueOrThrowMock(...a),
    },
    account: { count: (...a: unknown[]) => accountCountMock(...a) },
  }
}

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: { findUniqueOrThrow: (...a: unknown[]) => quotationFindUniqueOrThrowMock(...a) },
    downPayment: {
      findUniqueOrThrow: (...a: unknown[]) => dpFindUniqueOrThrowMock(...a),
      aggregate: (...a: unknown[]) => dpAggregateMock(...a),
      create: (...a: unknown[]) => dpCreateMock(...a),
      update: (...a: unknown[]) => dpUpdateMock(...a),
    },
    ...paymentBranches(),
    $transaction: (...a: unknown[]) => transactionMock(...a),
    $executeRaw: (...a: unknown[]) => txExecuteRawMock(...a),
  },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(),
  onSalesPaymentCreated: (...a: unknown[]) => onSalesPaymentCreatedMock(...a),
  onSalesReturnCompleted: vi.fn(),
  onDownPaymentReceived: vi.fn(),
  deleteJournalByReference: vi.fn(),
  deleteJournalByReferenceTx: (...a: unknown[]) => deleteJournalByReferenceTxMock(...a),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(),
  onSalesPaymentUpdated: (...a: unknown[]) => onSalesPaymentUpdatedMock(...a),
  onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocNumMock(...a),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: () => nextSlugMock() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
  reportPostCommitAuditFailure: vi.fn(),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn(),
  assertApproved: vi.fn(),
}))
vi.mock("@/lib/services/transaction-attachment.service", () => ({
  attachPendingTransactionAttachments: (...a: unknown[]) => attachMock(...a),
  deleteTransactionAttachmentsTx: vi.fn(),
  removeAttachmentFiles: vi.fn(),
}))
vi.mock("@/lib/services/sales-settlement.service", () => ({
  DOWN_PAYMENT_METHOD: "down_payment",
  hasRealSettlement: vi.fn().mockResolvedValue(false),
  salesOrderHasRealSettlement: vi.fn().mockResolvedValue(false),
  quotationHasRealSettlement: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/services/sales-invoice-posting.service", () => ({
  reverseSalesInvoicePostingTx: vi.fn(),
}))
vi.mock("@/lib/sales/return-validation", () => ({ findOverReturn: vi.fn().mockReturnValue(null) }))
vi.mock("@/lib/storage/storage", () => ({ assertMagicBytes: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}))

import { createDownPayment, updateDownPayment, updateSalesPayment } from "../sales.actions"

const allMocks = [
  requirePermissionMock, revalidateMock, logActivityMock, generateDocNumMock,
  quotationFindUniqueOrThrowMock, dpFindUniqueOrThrowMock, dpAggregateMock,
  dpCreateMock, dpUpdateMock, paymentFindUniqueOrThrowMock,
  invoiceFindUniqueOrThrowMock, paymentAggregateMock, paymentUpdateMock,
  accountCountMock, txExecuteRawMock, transactionMock, onSalesPaymentCreatedMock,
  onSalesPaymentUpdatedMock, deleteJournalByReferenceTxMock, attachMock,
]

function fdMap(payload: Record<string, string | number>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, String(v))
  return f
}

function dpFd(): FormData {
  return fdMap({ quotationId: 50, amount: 100, paymentDate: "2024-01-01" })
}

function paymentFd(salesInvoiceId: number): FormData {
  return fdMap({ salesInvoiceId, amount: 100, paymentDate: "2024-01-01", paymentMethod: "cash" })
}

beforeEach(() => {
  for (const m of allMocks) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  generateDocNumMock.mockResolvedValue("DOC-0001")
  txExecuteRawMock.mockResolvedValue(1)
  onSalesPaymentCreatedMock.mockResolvedValue(undefined)
  onSalesPaymentUpdatedMock.mockResolvedValue(undefined)
  deleteJournalByReferenceTxMock.mockResolvedValue(undefined)
  attachMock.mockResolvedValue(undefined)
})

describe("P2-3 DP quotation re-read guard", () => {
  function wireDpTx(order: string[], quotation: { status: string; grandTotal: number }) {
    const tx = {
      $executeRaw: (...a: unknown[]) => { order.push("lock"); return txExecuteRawMock(...a) },
      quotation: {
        findUniqueOrThrow: () => {
          order.push("reread")
          return Promise.resolve({ id: 50, status: quotation.status, customerId: 3, grandTotal: quotation.grandTotal })
        },
      },
      downPayment: {
        aggregate: (...a: unknown[]) => { order.push("aggregate"); return dpAggregateMock(...a) },
        create: (...a: unknown[]) => dpCreateMock(...a),
        update: (...a: unknown[]) => dpUpdateMock(...a),
      },
    }
    transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
  }

  beforeEach(() => {
    dpAggregateMock.mockResolvedValue({ _sum: { amount: 200 } })
    dpCreateMock.mockResolvedValue({ id: 11 })
    dpUpdateMock.mockResolvedValue({ id: 99 })
    dpFindUniqueOrThrowMock.mockResolvedValue({ id: 99, status: "draft", documentNo: "DP-1" })
  })

  it("createDownPayment: lock → re-read quotation → cap check, strictly in order", async () => {
    const order: string[] = []
    wireDpTx(order, { status: "accepted", grandTotal: 1000 })

    const result = await createDownPayment(dpFd())

    expect(result.success).toBe(true)
    expect(quotationFindUniqueOrThrowMock).not.toHaveBeenCalled() // no outer read
    expect(order).toEqual(["lock", "reread", "aggregate"])
  })

  it("createDownPayment: rejects when the in-tx re-read is no longer eligible", async () => {
    wireDpTx([], { status: "draft", grandTotal: 1000 })

    const result = await createDownPayment(dpFd())

    expect(result.success).toBe(false)
    expect(result.error).toContain("approved/accepted/converted")
    expect(dpCreateMock).not.toHaveBeenCalled()
  })

  it("updateDownPayment: re-reads quotation inside the tx and enforces the cap", async () => {
    const order: string[] = []
    wireDpTx(order, { status: "accepted", grandTotal: 1000 })

    const result = await updateDownPayment(99, dpFd())

    expect(result.success).toBe(true)
    expect(quotationFindUniqueOrThrowMock).not.toHaveBeenCalled() // no outer read
    expect(order).toEqual(["lock", "reread", "aggregate"])
  })

  it("updateDownPayment: rejects when the in-tx re-read is no longer eligible", async () => {
    wireDpTx([], { status: "cancelled", grandTotal: 1000 })

    const result = await updateDownPayment(99, dpFd())

    expect(result.success).toBe(false)
    expect(dpUpdateMock).not.toHaveBeenCalled()
  })
})

describe("P2-4 updateSalesPayment dual-invoice lock guard", () => {
  function wirePaymentTx(locks: number[]) {
    const tx = {
      // Capture lock order: the interpolated invoice id is the first template value.
      $executeRaw: (...a: unknown[]) => {
        if (a.length > 1) locks.push(Number(a[1]))
        return txExecuteRawMock(...a)
      },
      ...paymentBranches(),
    }
    transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
  }

  beforeEach(() => {
    invoiceFindUniqueOrThrowMock.mockResolvedValue({ id: 1, status: "posted", grandTotal: 1000 })
    paymentAggregateMock.mockResolvedValue({ _sum: { amount: 0, withholdingAmount: 0 } })
    accountCountMock.mockResolvedValue(0)
    paymentUpdateMock.mockImplementation(async (args: { data: { salesInvoiceId: number } }) =>
      ({ id: 5, salesInvoiceId: args.data.salesInvoiceId }))
  })

  it("locks BOTH invoices id-sorted when reassigning (anti-deadlock)", async () => {
    const locks: number[] = []
    wirePaymentTx(locks)
    // Old invoice 9 → new invoice 3: must lock [3, 9] (sorted), not [9, 3]
    paymentFindUniqueOrThrowMock.mockResolvedValue({ salesInvoiceId: 9, documentNo: "PAY-1" })

    const result = await updateSalesPayment(5, paymentFd(3))

    expect(result.success).toBe(true)
    expect(locks).toEqual([3, 9])
    // Old row read inside the tx, never outside
    expect(paymentFindUniqueOrThrowMock).toHaveBeenCalledTimes(1)
  })

  it("locks once when the invoice is unchanged", async () => {
    const locks: number[] = []
    wirePaymentTx(locks)
    paymentFindUniqueOrThrowMock.mockResolvedValue({ salesInvoiceId: 3, documentNo: "PAY-1" })

    const result = await updateSalesPayment(5, paymentFd(3))

    expect(result.success).toBe(true)
    expect(locks).toEqual([3])
  })

  it("recalcs the old invoice after a reassignment (stale-read guard)", async () => {
    const locks: number[] = []
    wirePaymentTx(locks)
    paymentFindUniqueOrThrowMock.mockResolvedValue({ salesInvoiceId: 9, documentNo: "PAY-1" })

    await updateSalesPayment(5, paymentFd(3))

    const recalced = onSalesPaymentUpdatedMock.mock.calls.map((c) => c[0])
    expect(recalced).toContain(3)
    expect(recalced).toContain(9)
  })
})
