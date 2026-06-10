import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the sales-conversion race fix (e43fe34). The actual race
// is closed by a DB row lock (SELECT ... FOR UPDATE on the quotation), which a
// mocked Prisma cannot enforce — so testing "two parallel converts" would be
// coverage theater. What IS meaningful and durable: assert the lock query is
// issued BEFORE the findFirst idempotency check, so nobody can silently drop or
// reorder it (which would re-open the TOCTOU window).

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const generateDocNumberMock = vi.fn()
const transactionMock = vi.fn()
const quotationFindUniqueOrThrowMock = vi.fn()

const queryRawMock = vi.fn()
const soFindFirstMock = vi.fn()
const soCreateMock = vi.fn()
const soItemCreateManyMock = vi.fn()
const quotationUpdateMock = vi.fn()

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
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocNumberMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))

import { convertQuotationToOrder } from "../sales.actions"

function wireTransaction() {
  const tx = {
    $queryRaw: queryRawMock,
    salesOrder: { findFirst: soFindFirstMock, create: soCreateMock },
    salesOrderItem: { createMany: soItemCreateManyMock },
    quotation: { update: quotationUpdateMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, generateDocNumberMock,
    transactionMock, quotationFindUniqueOrThrowMock, queryRawMock, soFindFirstMock,
    soCreateMock, soItemCreateManyMock, quotationUpdateMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  generateDocNumberMock.mockResolvedValue("SO-0001")
  quotationFindUniqueOrThrowMock.mockResolvedValue({
    id: 50, documentNo: "QUO-0001", status: "accepted", customerId: 3, customerVehicleId: 9,
    subtotal: 1000, discount: 0, tax: 110, grandTotal: 1110,
    sections: [{ items: [{ itemId: 7, description: "x", qty: 1, unitPrice: 1000, discount: 0, total: 1000 }] }],
  })
  queryRawMock.mockResolvedValue([])
  soFindFirstMock.mockResolvedValue(null)
  soCreateMock.mockResolvedValue({ id: 200 })
  soItemCreateManyMock.mockResolvedValue({ count: 1 })
  quotationUpdateMock.mockResolvedValue({})
  wireTransaction()
})

describe("convertQuotationToOrder concurrency guard", () => {
  it("locks the quotation row BEFORE the idempotency findFirst", async () => {
    const order: string[] = []
    queryRawMock.mockImplementation(() => { order.push("lock"); return Promise.resolve([]) })
    soFindFirstMock.mockImplementation(() => { order.push("findFirst"); return Promise.resolve(null) })

    const result = await convertQuotationToOrder(50)

    expect(result.success).toBe(true)
    expect(queryRawMock).toHaveBeenCalled()           // FOR UPDATE lock taken
    expect(order).toEqual(["lock", "findFirst"])       // lock strictly precedes the check
  })

  it("rejects when a Sales Order already exists (idempotent)", async () => {
    soFindFirstMock.mockResolvedValue({ id: 999 })
    const result = await convertQuotationToOrder(50)
    expect(result.success).toBe(false)
    expect(result.error).toContain("sudah memiliki Sales Order")
    expect(soCreateMock).not.toHaveBeenCalled()
  })
})
