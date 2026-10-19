import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * P0-1/P0-2 (review fix plan): DP confirmation tidak boleh kehilangan alokasi
 * dan tidak boleh mem-bypass posting resmi.
 *
 * - Invoice lahir mengalokasi SEMUA verified DP (bukan cuma DP pemicu).
 * - DP lanjutan idempoten via marker notes per nomor DP (retry aman).
 * - DP confirmation hanya sentuh paymentStatus — status lifecycle (draft /
 *   posted) milik postInvoice + gate izin/approval/period-lock.
 * - Retry DP confirmed TIDAK memanggil onSalesInvoicePosted.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  downPaymentFindMany: vi.fn(),
  downPaymentUpdate: vi.fn(),
  salesInvoiceFindFirst: vi.fn(),
  salesInvoiceCreate: vi.fn(),
  salesInvoiceUpdate: vi.fn(),
  salesPaymentCreate: vi.fn(),
  salesPaymentFindFirst: vi.fn(),
  salesPaymentFindMany: vi.fn(),
  generateDocumentNumber: vi.fn(),
  notifyDocumentsReadyBatch: vi.fn(),
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
    notifyDocumentsReadyBatch: (...a: unknown[]) => mocks.notifyDocumentsReadyBatch(...a),
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
    paymentDate: new Date("2026-10-01T00:00:00Z"),
    quotation: {
      id: 10,
      status: "accepted",
      customerId: 99,
      customerVehicleId: null,
      documentNo: "Q-1",
      subtotal: 1000,
      discount: 0,
      tax: 0,
      grandTotal: 1000,
      customer: { id: 99, name: "Cust" },
      customerVehicle: null,
      projectId: null,
      sections: [
        {
          id: 1,
          name: "S1",
          items: [
            { id: 1, itemId: 1, description: "Item", qty: 1, unitPrice: 1000, discount: 0, total: 1000 },
          ],
        },
      ],
    },
  }
}

function buildTx(dp: ReturnType<typeof buildDp>) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(undefined),
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    downPayment: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(dp),
      findMany: mocks.downPaymentFindMany,
      update: mocks.downPaymentUpdate,
    },
    workOrder: { findFirst: vi.fn().mockResolvedValue({ id: 11 }), create: vi.fn() },
    salesOrder: { findFirst: vi.fn().mockResolvedValue({ id: 12 }), create: vi.fn() },
    salesInvoice: {
      findFirst: mocks.salesInvoiceFindFirst,
      create: mocks.salesInvoiceCreate,
      update: mocks.salesInvoiceUpdate,
    },
    salesPayment: {
      findMany: mocks.salesPaymentFindMany,
      findFirst: mocks.salesPaymentFindFirst,
      create: mocks.salesPaymentCreate,
    },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    item: { findMany: vi.fn().mockResolvedValue([]) },
    workOrderItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    project: { create: vi.fn().mockResolvedValue({ id: 21 }) },
    projectStage: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    salesOrderItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    salesInvoiceItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    quotation: { update: vi.fn() },
    quotationHistory: { create: vi.fn() },
  }
}

describe("review P0-1/P0-2 — alokasi DP penuh + tanpa bypass posting", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateDocumentNumber.mockImplementation((prefix: string) => Promise.resolve(`${prefix}-1`))
    mocks.notifyDocumentsReadyBatch.mockResolvedValue(undefined)
    mocks.onSalesInvoicePosted.mockResolvedValue(undefined)
    mocks.downPaymentUpdate.mockResolvedValue({})
    mocks.salesPaymentCreate.mockResolvedValue({ id: 555 })
    mocks.salesPaymentFindFirst.mockResolvedValue(null)
    mocks.salesPaymentFindMany.mockResolvedValue([])
    mocks.salesInvoiceCreate.mockResolvedValue({ id: 101, documentNo: "INV-1" })
    mocks.salesInvoiceUpdate.mockResolvedValue({})
    // Jalur lahir invoice: belum ada invoice.
    mocks.salesInvoiceFindFirst.mockResolvedValue(null)
  })

  it("DP2 200 memicu ambang (DP1 300 sudah confirmed): invoice alokasi KEDUA DP = 500", async () => {
    const dp = buildDp({ id: 2, amount: 200, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp)
    // Kumulatif verified = DP1 300 + DP2 200 = 500 = tepat 50%.
    mocks.downPaymentFindMany.mockImplementation(async (args: any) => {
      if (args?.where?.status === "confirmed") {
        return [
          { documentNo: "DP-1", amount: 300, paymentDate: new Date("2026-09-01T00:00:00Z") },
          { documentNo: "DP-2", amount: 200, paymentDate: new Date("2026-10-01T00:00:00Z") },
        ]
      }
      return []
    })
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    // Dua SalesPayment: satu per verified DP.
    expect(mocks.salesPaymentCreate).toHaveBeenCalledTimes(2)
    expect(mocks.salesPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notes: expect.stringContaining("DP-1") }) }),
    )
    expect(mocks.salesPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notes: expect.stringContaining("DP-2") }) }),
    )
    // paidAmount invoice = 500 (semua verified DP), bukan 200.
    expect(mocks.salesInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paidAmount: 500 }) }),
    )
    // Invoice lahir draft + posting TIDAK dipanggil.
    expect(mocks.salesInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "draft" }) }),
    )
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
  })

  it("retry DP lanjutan yang sudah teralokasi: tidak buat SalesPayment kedua", async () => {
    const dp = buildDp({ id: 2, amount: 200, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp)
    // Invoice SUDAH ada (dari confirm pertama) + marker DP-2 sudah teralokasi.
    mocks.salesInvoiceFindFirst.mockResolvedValue({ id: 101, grandTotal: 1000, paymentStatus: "partial" })
    mocks.salesPaymentFindFirst.mockResolvedValue({ id: 555 })
    mocks.salesPaymentFindMany.mockResolvedValue([{ amount: 500 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    expect(mocks.salesPaymentCreate).not.toHaveBeenCalled()
  })

  it("DP lanjutan tidak mengubah status lifecycle invoice (tetap draft)", async () => {
    const dp = buildDp({ id: 3, amount: 100, status: "draft", docNo: "DP-3" })
    const tx = buildTx(dp)
    mocks.salesInvoiceFindFirst.mockResolvedValue({ id: 101, grandTotal: 1000, paymentStatus: "partial" })
    mocks.salesPaymentFindFirst.mockResolvedValue(null)
    mocks.salesPaymentFindMany.mockResolvedValue([{ amount: 500 }, { amount: 100 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(3, 1)

    // Update hanya paidAmount + paymentStatus — TIDAK ada kunci `status`.
    expect(mocks.salesInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: expect.anything() }),
      }),
    )
    expect(mocks.salesInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "partial" }) }),
    )
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
  })

  it("retry DP confirmed: return tanpa posting", async () => {
    const dp = buildDp({ id: 2, amount: 200, status: "confirmed", docNo: "DP-2" })
    const tx = buildTx(dp)
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
    expect(mocks.salesPaymentCreate).not.toHaveBeenCalled()
  })
})
