import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * P0-1: invoice konversi DP lahir SEKALI sebagai DRAFT, hanya bila total DP
 * terverifikasi (CONFIRMED) mencapai minimal 50% nilai quotation.
 * DP di bawah ambang: WO/SO/Project dibuat (kerja boleh mulai) tapi TANPA
 * invoice, TANPA posting, TANPA stock-out.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  downPaymentFindMany: vi.fn(),
  downPaymentUpdate: vi.fn(),
  workOrderFindFirst: vi.fn(),
  salesOrderFindFirst: vi.fn(),
  workOrderCreate: vi.fn(),
  salesOrderCreate: vi.fn(),
  salesInvoiceCreate: vi.fn(),
  salesInvoiceFindFirst: vi.fn(),
  salesPaymentCreate: vi.fn(),
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

function buildDp(opts: { id: number; amount: number; status: string; docNo: string; paymentDate?: Date }) {
  return {
    id: opts.id,
    documentNo: opts.docNo,
    quotationId: 10,
    amount: opts.amount,
    status: opts.status,
    paymentDate: opts.paymentDate ?? new Date("2026-10-01T00:00:00Z"),
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
    workOrder: { findFirst: mocks.workOrderFindFirst, create: mocks.workOrderCreate },
    salesOrder: { findFirst: mocks.salesOrderFindFirst, create: mocks.salesOrderCreate },
    salesInvoice: {
      findFirst: mocks.salesInvoiceFindFirst,
      create: mocks.salesInvoiceCreate,
      update: vi.fn(),
    },
    salesPayment: { findMany: vi.fn().mockResolvedValue([]), create: mocks.salesPaymentCreate },
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

describe("ambang 50% konversi DP ke invoice", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateDocumentNumber.mockImplementation((prefix: string) => Promise.resolve(`${prefix}-1`))
    mocks.notifyDocumentsReadyBatch.mockResolvedValue(undefined)
    mocks.onSalesInvoicePosted.mockResolvedValue(undefined)
    mocks.downPaymentUpdate.mockResolvedValue({})
    mocks.salesPaymentCreate.mockResolvedValue({ id: 555 })
    mocks.workOrderCreate.mockResolvedValue({ id: 11, documentNo: "WO-1" })
    mocks.salesOrderCreate.mockResolvedValue({ id: 12, documentNo: "SO-1" })
    mocks.salesInvoiceCreate.mockResolvedValue({ id: 101, documentNo: "INV-1" })
    // Jalur pembuatan: belum ada WO/SO/invoice.
    mocks.workOrderFindFirst.mockResolvedValue(null)
    mocks.salesOrderFindFirst.mockResolvedValue(null)
    mocks.salesInvoiceFindFirst.mockResolvedValue(null)
  })

  it("DP 300 dari 1000 (30%): WO/SO dibuat, invoice TIDAK dibuat, posting TIDAK dipanggil", async () => {
    const dp = buildDp({ id: 1, amount: 300, status: "draft", docNo: "DP-1" })
    const tx = buildTx(dp)
    // Kumulatif terverifikasi setelah DP ini CONFIRMED = 300 < 500.
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 300 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(1, 1)

    expect(mocks.workOrderCreate).toHaveBeenCalled()
    expect(mocks.salesOrderCreate).toHaveBeenCalled()
    expect(mocks.salesInvoiceCreate).not.toHaveBeenCalled()
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
    expect(mocks.downPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ status: "confirmed" }) })
    )
  })

  it("DP kedua genap 50% (200+300 dari 1000): invoice DRAFT dibuat sekali", async () => {
    const dp = buildDp({ id: 2, amount: 200, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp)
    // WO/SO sudah ada dari DP pertama; kumulatif = 500 = tepat 50%.
    mocks.workOrderFindFirst.mockResolvedValue({ id: 11 })
    mocks.salesOrderFindFirst.mockResolvedValue({ id: 12 })
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 300 }, { amount: 200 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    expect(mocks.workOrderCreate).not.toHaveBeenCalled()
    expect(mocks.salesOrderCreate).not.toHaveBeenCalled()
    expect(mocks.salesInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "draft" }) })
    )
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
  })

  it("DP draft/batal tidak dihitung dalam kumulatif", async () => {
    const dp = buildDp({ id: 3, amount: 400, status: "draft", docNo: "DP-3" })
    const tx = buildTx(dp)
    // findMany hanya kembalikan CONFIRMED — draft 400 + confirmed 100 = 100.
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 100 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(3, 1)

    // findMany WAJIB menyaring status CONFIRMED.
    expect(mocks.downPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "confirmed" }) })
    )
    expect(mocks.salesInvoiceCreate).not.toHaveBeenCalled()
  })

  it("SalesPayment memakai tanggal bayar DP aktual, bukan hari ini", async () => {
    const payDate = new Date("2026-09-15T00:00:00Z")
    const dp = buildDp({ id: 4, amount: 600, status: "draft", docNo: "DP-4", paymentDate: payDate })
    const tx = buildTx(dp)
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 600 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(4, 1)

    expect(mocks.salesPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentDate: payDate }) })
    )
  })
})
