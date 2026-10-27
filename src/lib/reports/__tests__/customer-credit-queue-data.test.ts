import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader antrean saldo kredit pelanggan (F-2026-10-27-083-S AC-CCQ-B2/B4/B5
 * + 085-V V1/V6). Dijaga: pasangan izin fail-closed sebelum query, query
 * TaxInvoice massal persis syarat J-RF1 (direction out + djpStatus notIn
 * cancelled/replaced atas himpunan downPaymentId), select tanpa data
 * pembayaran sensitif, baca-saja (mock prisma hanya findMany).
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  creditFindMany: vi.fn(),
  dpFindMany: vi.fn(),
  taxInvoiceFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customerCredit: { findMany: mocks.creditFindMany },
    downPayment: { findMany: mocks.dpFindMany },
    taxInvoice: { findMany: mocks.taxInvoiceFindMany },
  },
}))

import { getCustomerCreditQueue } from "../customer-credit-queue-data"
import { CUSTOMER_CREDIT_FP_UM_MARKER_TEXT } from "../customer-credit-queue"

const dec = (v: string) => ({ toString: () => v, valueOf: () => Number(v) })

function creditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    documentNo: "CC-1",
    customerId: 7,
    sourceType: "DownPayment",
    sourceId: 10,
    receivedAmount: dec("1000000.00"),
    allocatedAmount: dec("0.00"),
    refundedAmount: dec("0.00"),
    status: "open",
    createdAt: new Date("2026-10-20T00:00:00.000Z"),
    updatedAt: new Date("2026-10-20T00:00:00.000Z"),
    customer: { name: "Budi" },
    ...overrides,
  }
}

function dpRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    amount: dec("1000000.00"),
    vatTransactionCode: "04",
    vatRate: dec("11.00"),
    vatDpp: dec("900000.00"),
    vatAmount: dec("99000.00"),
    vatTaxPeriod: "2026-10",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: "5" })
  mocks.creditFindMany.mockResolvedValue([creditRow()])
  mocks.dpFindMany.mockResolvedValue([dpRow()])
  mocks.taxInvoiceFindMany.mockResolvedValue([{ downPaymentId: 10 }])
})

describe("getCustomerCreditQueue — gerbang + query massal", () => {
  it("pasangan izin ditegakkan sebelum query apa pun", async () => {
    await getCustomerCreditQueue()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_sales_invoices")
    expect(mocks.requirePermission).toHaveBeenCalledWith("confirm_down_payments")
    expect(mocks.requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.creditFindMany.mock.invocationCallOrder[0],
    )
  })

  it("V1: DP ber-FP UM aktif + snapshot ppn>0 → penanda server di payload", async () => {
    const queue = await getCustomerCreditQueue()
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].penandaFpUm).toBe(CUSTOMER_CREDIT_FP_UM_MARKER_TEXT)
  })

  it("V6: query TaxInvoice massal persis syarat J-RF1 atas himpunan DP populasi", async () => {
    await getCustomerCreditQueue()
    expect(mocks.taxInvoiceFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.taxInvoiceFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      downPaymentId: { in: [10] },
      direction: "out",
      djpStatus: { notIn: ["cancelled", "replaced"] },
    })
  })

  it("FP UM hanya cancelled/replaced (query aktif kosong) → penanda hilang", async () => {
    mocks.taxInvoiceFindMany.mockResolvedValue([])
    const queue = await getCustomerCreditQueue()
    expect(queue.rows[0].penandaFpUm).toBeNull()
  })

  it("DP legacy tanpa snapshot (vatAmount null) → tanpa penanda", async () => {
    mocks.dpFindMany.mockResolvedValue([
      dpRow({ vatAmount: null, vatDpp: null, vatTaxPeriod: null }),
    ])
    const queue = await getCustomerCreditQueue()
    expect(queue.rows[0].penandaFpUm).toBeNull()
  })

  it("AC-CCQ-B5: select loader tanpa field pembayaran sensitif/kontak", async () => {
    await getCustomerCreditQueue()
    const creditSelect = JSON.stringify(mocks.creditFindMany.mock.calls[0][0].select)
    expect(creditSelect).not.toContain("proofImage")
    expect(creditSelect).not.toContain("referenceNo")
    expect(creditSelect).not.toContain("phone")
    const dpSelect = JSON.stringify(mocks.dpFindMany.mock.calls[0][0].select)
    expect(dpSelect).not.toContain("proofImage")
  })

  it("tanpa baris DownPayment → query DP/FP tidak dijalankan", async () => {
    mocks.creditFindMany.mockResolvedValue([
      creditRow({ sourceType: "Quotation", sourceId: 3 }),
    ])
    const queue = await getCustomerCreditQueue()
    expect(mocks.dpFindMany).not.toHaveBeenCalled()
    expect(mocks.taxInvoiceFindMany).not.toHaveBeenCalled()
    expect(queue.rows[0].penandaFpUm).toBeNull()
  })
})
