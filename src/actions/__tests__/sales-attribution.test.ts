import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-21-016 tahap 1 — atribusi penjual snapshot.
 * Yang dijaga: convertQuotationToOrder menyalin salesEmployeeId penawaran
 * ke SO apa adanya (snapshot, bukan baca master berjalan); createQuotation
 * menolak salesEmployeeId yang bukan Employee aktif, menerima kosong.
 */

const requirePermissionMock = vi.fn()
const transactionMock = vi.fn()
const quotationFindUniqueOrThrowMock = vi.fn()
const employeeFindFirstMock = vi.fn()
const quotationCreateMock = vi.fn()
const soCreateMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: {
      findUniqueOrThrow: (...a: unknown[]) => quotationFindUniqueOrThrowMock(...a),
      findFirst: vi.fn(),
    },
    customerVehicle: { findFirst: vi.fn() },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(), onSalesPaymentCreated: vi.fn(),
  onSalesReturnCompleted: vi.fn(), onDownPaymentReceived: vi.fn(),
  deleteJournalByReference: vi.fn(), deleteJournalByReferenceTx: vi.fn(),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(), onSalesPaymentUpdated: vi.fn(), onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn(async () => "DOC-0001"),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/credit-gate.service", () => ({
  assessCreditGateInTx: vi.fn().mockResolvedValue({ kind: "gate_off" }),
  assertCreditGatePassed: () => null,
  consumeApprovedCreditOverrideInTx: vi.fn(),
  isCreditGateBlockedError: () => false,
  persistCreditGatePending: vi.fn(async () => null),
}))

import { convertQuotationToOrder, createQuotation } from "../sales.actions"

beforeEach(() => {
  for (const m of [requirePermissionMock, transactionMock, quotationFindUniqueOrThrowMock, employeeFindFirstMock, quotationCreateMock, soCreateMock]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
})

function wireConvertTx() {
  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      $queryRaw: vi.fn(async () => []),
      salesOrder: { findFirst: vi.fn(async () => null), create: soCreateMock },
      salesOrderItem: { createMany: vi.fn() },
      quotation: { update: vi.fn() },
    }),
  )
}

function quotation(over: Record<string, unknown> = {}) {
  return {
    id: 50, documentNo: "QUO-0001", status: "accepted", customerId: 3, customerVehicleId: null,
    salesEmployeeId: 7, validUntil: null,
    subtotal: 1000, discount: 0, tax: 0, grandTotal: 1000,
    sections: [{ items: [] }],
    ...over,
  }
}

describe("F-016 tahap 1 pewarisan penjual", () => {
  it("convert: SO mewarisi salesEmployeeId penawaran", async () => {
    quotationFindUniqueOrThrowMock.mockResolvedValue(quotation())
    soCreateMock.mockResolvedValue({ id: 99 })
    wireConvertTx()
    const r = await convertQuotationToOrder(50)
    expect(r.success).toBe(true)
    expect(soCreateMock.mock.calls[0][0].data.salesEmployeeId).toBe(7)
  })

  it("convert: penawaran tanpa penjual -> SO tanpa penjual", async () => {
    quotationFindUniqueOrThrowMock.mockResolvedValue(quotation({ salesEmployeeId: null }))
    soCreateMock.mockResolvedValue({ id: 99 })
    wireConvertTx()
    await convertQuotationToOrder(50)
    expect(soCreateMock.mock.calls[0][0].data.salesEmployeeId).toBeNull()
  })

  it("createQuotation: penjual nonaktif/fiktif ditolak, kosong diterima", async () => {
    employeeFindFirstMock.mockResolvedValue(null)
    transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        employee: { findFirst: employeeFindFirstMock },
        // F-2026-10-22-065-S: snapshot persen ambang membaca kategori pelanggan.
        customer: { findFirst: vi.fn(async () => null) },
        quotation: { create: quotationCreateMock },
        quotationHistory: { create: vi.fn() },
      }),
    )
    const fd = new FormData()
    fd.set("data", JSON.stringify({ customerId: 3, date: "2026-10-21", salesEmployeeId: 404, sections: [] }))
    const bad = await createQuotation(fd)
    expect(bad.success).toBe(false)
    expect(quotationCreateMock).not.toHaveBeenCalled()

    quotationCreateMock.mockResolvedValue({ id: 5 })
    const fd2 = new FormData()
    fd2.set("data", JSON.stringify({ customerId: 3, date: "2026-10-21", sections: [] }))
    const ok = await createQuotation(fd2)
    expect(ok.success).toBe(true)
    expect(quotationCreateMock.mock.calls[0][0].data.salesEmployeeId).toBeNull()
  })
})
