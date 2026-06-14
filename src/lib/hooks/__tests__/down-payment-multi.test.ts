import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regression test for the multi-DP confirmation bug.
 *
 * Bug: `onDownPaymentConfirmed` rejects any confirmation once the quotation
 * has been converted by a prior DP, AND its idempotency guards return silently
 * when WO/SO/Invoice already exist — so a second DP on the same quotation
 * (which the system explicitly allows, see `createDownPayment` in
 * sales.actions.ts) can never be confirmed and its `SalesPayment` row is
 * never created, so the invoice `paidAmount` is never credited for the
 * second DP and AR is permanently overstated on the GL.
 *
 * This test exercises the hook against a converted quotation with an
 * already-existing invoice. Before the fix, the hook throws
 * "Quotation belum di-accept." After the fix, the hook should:
 *   1. NOT throw
 *   2. Create a SalesPayment for the new DP linked to the existing invoice
 *   3. Update the DP status to CONFIRMED
 *   4. Recalculate the invoice's paidAmount
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  downPaymentFindUnique: vi.fn(),
  downPaymentUpdate: vi.fn(),
  workOrderFindFirst: vi.fn(),
  salesOrderFindFirst: vi.fn(),
  salesInvoiceFindFirst: vi.fn(),
  salesInvoiceUpdate: vi.fn(),
  salesPaymentFindMany: vi.fn(),
  salesPaymentCreate: vi.fn(),
  generateDocumentNumber: vi.fn(),
  notifyDocumentReady: vi.fn(),
  onSalesInvoicePosted: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: any) => mocks.transaction(fn),
    $queryRaw: (...a: unknown[]) => mocks.queryRaw(...a),
  },
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocumentNumber(...a),
}))

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: {
    notifyDocumentReady: (...a: unknown[]) => mocks.notifyDocumentReady(...a),
  },
}))

vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: (...a: unknown[]) => mocks.onSalesInvoicePosted(...a),
}))

import { onDownPaymentConfirmed } from "../down-payment.hook"

function buildDp(opts: { id: number; amount: number; status: string; docNo: string }) {
  return {
    id: opts.id,
    documentNo: opts.docNo,
    quotationId: 10,
    amount: opts.amount,
    status: opts.status,
    quotation: {
      id: 10,
      status: "converted",
      customerId: 99,
      customerVehicleId: null,
      documentNo: "Q-1",
      subtotal: 1000,
      discount: 0,
      tax: 0,
      grandTotal: 1000,
      customer: { id: 99, name: "Cust" },
      customerVehicle: null,
      sections: [
        {
          id: 1,
          name: "Section 1",
          items: [
            {
              id: 1,
              itemId: 1,
              description: "Item",
              qty: 1,
              unitPrice: 1000,
              discount: 0,
              total: 1000,
            },
          ],
        },
      ],
    },
  }
}

function buildTx(dp: ReturnType<typeof buildDp>, existingInvoiceId: number) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(undefined),
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    downPayment: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(dp),
      update: mocks.downPaymentUpdate,
    },
    workOrder: { findFirst: mocks.workOrderFindFirst },
    salesOrder: { findFirst: mocks.salesOrderFindFirst },
    salesInvoice: {
      findFirst: mocks.salesInvoiceFindFirst,
      update: mocks.salesInvoiceUpdate,
    },
    salesPayment: {
      findMany: mocks.salesPaymentFindMany,
      create: mocks.salesPaymentCreate,
    },
    product: { findFirst: vi.fn().mockResolvedValue(null) },
    productMaterial: { findMany: vi.fn().mockResolvedValue([]) },
    item: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    workOrderItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    project: { create: vi.fn() },
    projectStage: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    salesOrderItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    salesInvoiceItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    quotation: { update: vi.fn() },
    existingInvoiceId,
  }
}

describe("onDownPaymentConfirmed — multi-DP support", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateDocumentNumber.mockResolvedValue("PAY-1")
    mocks.onSalesInvoicePosted.mockResolvedValue(undefined)
    mocks.notifyDocumentReady.mockResolvedValue(undefined)
    mocks.downPaymentUpdate.mockResolvedValue({})
    mocks.salesPaymentCreate.mockResolvedValue({ id: 555, amount: 500 })
    mocks.salesPaymentFindMany.mockResolvedValue([{ amount: 500 }])
    mocks.salesInvoiceUpdate.mockResolvedValue({})
    mocks.workOrderFindFirst.mockResolvedValue({ id: 1 })
    mocks.salesOrderFindFirst.mockResolvedValue({ id: 1 })
    mocks.salesInvoiceFindFirst.mockResolvedValue({ id: 100, grandTotal: 1000 })
  })

  it("records a subsequent DP as SalesPayment on the existing invoice", async () => {
    // DP1 already converted the quotation; the second DP (id=2, amount=500)
    // is being confirmed.
    const dp2 = buildDp({ id: 2, amount: 500, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp2, 100)
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    // The quotation is already "converted" (DP1's confirmation set it).
    // The hook should NOT throw, even though dp.quotation.status === "converted".
    await expect(onDownPaymentConfirmed(2, 1)).resolves.toBeUndefined()

    // The new SalesPayment for DP2 must be linked to the existing invoice.
    expect(mocks.salesPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          salesInvoiceId: 100,
          amount: 500,
          paymentMethod: "down_payment",
        }),
      })
    )
  })

  it("marks the subsequent DP as CONFIRMED", async () => {
    const dp2 = buildDp({ id: 2, amount: 500, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp2, 100)
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    expect(mocks.downPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({ status: "confirmed" }),
      })
    )
  })

  it("does NOT re-create WO/SO/Invoice or re-post the invoice for a subsequent DP", async () => {
    const dp2 = buildDp({ id: 2, amount: 500, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp2, 100)
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    // project.create / workOrder.create / salesOrder.create / salesInvoice.create
    // must not run. The existing tx mocks would throw if they were called
    // (they return undefined and the hook would crash). The test passes only
    // if the subsequent-DP branch returns cleanly without those calls.
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
  })
})
