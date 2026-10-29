import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-25-036-S (BR-KT36-04): snapshot tarif komisi dibekukan di
 * recalcCore sales-payment.hook pada transisi ke paid — resolusi per
 * TANGGAL FAKTUR; snapshot existing tidak ditulis ulang; tarif mundur
 * tidak mengisi faktur lama (0 tertulis); pindah kategori pelanggan
 * sesudah lunas tidak mengubah snapshot (AC-KT-2/AC-KT-4 sisi faktur).
 */

const mocks = vi.hoisted(() => ({
  db: {
    salesInvoice: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    salesPayment: { findMany: vi.fn() },
    customer: { findUnique: vi.fn() },
    customerCommissionRate: { findMany: vi.fn() },
    // accrueTx komisi (tahap 3): no-op default — snapshot tetap milik hook lama.
    commissionPayable: { findFirst: vi.fn(async () => null), create: vi.fn(), update: vi.fn() },
    systemSetting: { findFirst: vi.fn(async () => null) },
  },
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { ...mocks.db, $transaction: async (fn: (tx: unknown) => unknown) => fn(mocks.db) },
}))

import { onSalesPaymentUpdated } from "../sales-payment.hook"

const invoiceDate = new Date(Date.UTC(2026, 0, 10)) // faktur 10 Jan 2026
const baseInvoice = {
  id: 5,
  status: "partial",
  customerId: 9,
  date: invoiceDate,
  grandTotal: 12320000,
  commissionRatePercent: null as number | null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.salesPayment.findMany.mockResolvedValue([{ amount: 12320000, withholdingAmount: 0 }])
  mocks.db.salesInvoice.update.mockResolvedValue({})
  mocks.db.customer.findUnique.mockResolvedValue({ customerCategoryId: 1 })
  // tarif diganti di antara tanggal faktur dan tanggal lunas:
  // 2% berlaku 1 Jan–1 Jul, 3% sesudahnya. Tanggal faktur -> 2%.
  mocks.db.customerCommissionRate.findMany.mockResolvedValue([
    { id: 1, customerCategoryId: 1, commissionPercent: 2, effectiveFrom: new Date(Date.UTC(2026, 0, 1)), effectiveTo: new Date(Date.UTC(2026, 6, 1)) },
    { id: 2, customerCategoryId: 1, commissionPercent: 3, effectiveFrom: new Date(Date.UTC(2026, 6, 1)), effectiveTo: null },
  ])
})

describe("snapshot komisi transisi paid", () => {
  it("AC-KT-2: lunas -> snapshot 2% per tanggal faktur (bukan 3% hari lunas)", async () => {
    mocks.db.salesInvoice.findUniqueOrThrow.mockResolvedValue({ ...baseInvoice })
    await onSalesPaymentUpdated(5, mocks.db as never)
    expect(mocks.db.salesInvoice.update).toHaveBeenCalledTimes(1)
    const data = mocks.db.salesInvoice.update.mock.calls[0][0].data
    expect(data.status).toBe("paid")
    expect(Number(data.commissionRatePercent)).toBe(2)
    expect(data.commissionCustomerCategoryId).toBe(1)
    expect(data.commissionRateId).toBe(1)
  })

  it("snapshot existing beku: transisi berikutnya tidak menulis ulang (kategori/tarif berubah)", async () => {
    mocks.db.salesInvoice.findUniqueOrThrow.mockResolvedValue({ ...baseInvoice, commissionRatePercent: 2 })
    await onSalesPaymentUpdated(5, mocks.db as never)
    const data = mocks.db.salesInvoice.update.mock.calls[0][0].data
    expect(data.commissionRatePercent).toBeUndefined()
    expect(mocks.db.customerCommissionRate.findMany).not.toHaveBeenCalled()
  })

  it("BR-KT36-13: tanpa tarif berlaku -> 0 tertulis (tarif mundur tidak backfill)", async () => {
    mocks.db.salesInvoice.findUniqueOrThrow.mockResolvedValue({ ...baseInvoice })
    mocks.db.customerCommissionRate.findMany.mockResolvedValue([])
    await onSalesPaymentUpdated(5, mocks.db as never)
    const data = mocks.db.salesInvoice.update.mock.calls[0][0].data
    expect(Number(data.commissionRatePercent)).toBe(0)
    expect(data.commissionRateId).toBeNull()
  })

  it("belum lunas (partial): snapshot tidak ditulis", async () => {
    mocks.db.salesInvoice.findUniqueOrThrow.mockResolvedValue({ ...baseInvoice })
    mocks.db.salesPayment.findMany.mockResolvedValue([{ amount: 100, withholdingAmount: 0 }])
    await onSalesPaymentUpdated(5, mocks.db as never)
    const data = mocks.db.salesInvoice.update.mock.calls[0][0].data
    expect(data.status).toBe("partial")
    expect(data.commissionRatePercent).toBeUndefined()
  })

  it("pelanggan tanpa kategori: snapshot 0 jujur, kategori null", async () => {
    mocks.db.salesInvoice.findUniqueOrThrow.mockResolvedValue({ ...baseInvoice })
    mocks.db.customer.findUnique.mockResolvedValue({ customerCategoryId: null })
    await onSalesPaymentUpdated(5, mocks.db as never)
    const data = mocks.db.salesInvoice.update.mock.calls[0][0].data
    expect(Number(data.commissionRatePercent)).toBe(0)
    expect(data.commissionCustomerCategoryId).toBeNull()
  })
})
