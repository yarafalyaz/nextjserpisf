import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test: updateSalesInvoice never runs parseFormData(updateSalesInvoiceSchema)
// and read `taxRate` straight from FormData with no lower-bound clamp. The header
// discount is clamped to [0, subtotal], but taxRate was not — so a negative taxRate
// produced a negative taxAmount which drove the stored grandTotal/totalAmount below
// zero. Posting such an invoice would then write a negative AR / revenue journal.
// The fix clamps taxRate to >= 0 (mirroring the existing discount clamp).

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()

const invoiceFindUniqueOrThrowMock = vi.fn()
const invoiceUpdateMock = vi.fn()
const invoiceItemDeleteManyMock = vi.fn()
const invoiceItemCreateManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => {
  const mockPrisma = {
    $transaction: vi.fn((cb: any) => cb(mockPrisma)),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
    salesInvoice: {
      findUniqueOrThrow: (...a: unknown[]) => invoiceFindUniqueOrThrowMock(...a),
      update: (...a: unknown[]) => invoiceUpdateMock(...a),
    },
    salesInvoiceItem: {
      deleteMany: (...a: unknown[]) => invoiceItemDeleteManyMock(...a),
      createMany: (...a: unknown[]) => invoiceItemCreateManyMock(...a),
    },
  }
  return { prisma: mockPrisma }
})
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(),
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

import { updateSalesInvoice } from "../sales.actions"

function fd(map: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(map)) f.append(k, v)
  return f
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock,
    invoiceFindUniqueOrThrowMock, invoiceUpdateMock,
    invoiceItemDeleteManyMock, invoiceItemCreateManyMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 3 })
  // First call: existing invoice (must be draft). Second call (inside tx): paidAmount.
  invoiceFindUniqueOrThrowMock
    .mockResolvedValueOnce({ id: 11, status: "draft" })
    .mockResolvedValueOnce({ paidAmount: 0 })
  invoiceUpdateMock.mockResolvedValue({ id: 11 })
  invoiceItemDeleteManyMock.mockResolvedValue({ count: 0 })
  invoiceItemCreateManyMock.mockResolvedValue({ count: 1 })
})

describe("updateSalesInvoice negative taxRate guard", () => {
  it("never persists a negative taxAmount / grandTotal even when taxRate is negative", async () => {
    const result = await updateSalesInvoice(11, fd({
      customerId: "8",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 1000 }]),
      taxRate: "-200", // would produce taxAmount = -2000, grandTotal = -1000
      discount: "0",
    }))

    expect(result.success).toBe(true)

    // The second salesInvoice.update is the totals write.
    const totalsCall = invoiceUpdateMock.mock.calls.find(
      (c) => c[0]?.data && "grandTotal" in c[0].data,
    )
    expect(totalsCall).toBeDefined()
    const data = totalsCall![0].data

    expect(data.taxAmount).toBeGreaterThanOrEqual(0)
    expect(data.tax).toBeGreaterThanOrEqual(0)
    expect(data.grandTotal).toBeGreaterThanOrEqual(0)
    expect(data.totalAmount).toBeGreaterThanOrEqual(0)
    // With taxRate clamped to 0, grandTotal == subtotal (1000), no negative GL.
    expect(data.grandTotal).toBe(1000)
  })
})
