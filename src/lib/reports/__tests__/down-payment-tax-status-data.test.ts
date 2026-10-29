import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({ findDownPayments: vi.fn() }))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { downPayment: { findMany: (...a: unknown[]) => mocks.findDownPayments(...a) } },
}))

import { loadDownPaymentTaxStatusRows } from "../down-payment-tax-status-data"

const dpRow = (id: number, status = "confirmed") => ({
  id,
  documentNo: `DP-${id}`,
  customer: { name: "CV Uji" },
  paymentDate: new Date("2026-10-01T00:00:00.000Z"),
  amount: "1100000",
  status,
  vatTransactionCode: "04",
  vatRate: "11",
  vatDpp: "1000000",
  vatAmount: "110000",
  vatTaxPeriod: "2026-10",
  companyPkpStatusSnapshot: "pkp",
  companyPkpEffectiveFromSnapshot: null,
  taxInvoices: [
    { id: 9, taxInvoiceNumber: "FP-9", djpStatus: "approved" },
    { id: 8, taxInvoiceNumber: "FP-8", djpStatus: "cancelled" },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("loadDownPaymentTaxStatusRows", () => {
  it("downPaymentId didorong ke where; keluaran sama dengan saring di memori", async () => {
    mocks.findDownPayments.mockResolvedValue([dpRow(2)])

    const rows = await loadDownPaymentTaxStatusRows({ downPaymentId: 2 })

    expect(mocks.findDownPayments.mock.calls[0]?.[0]?.where).toEqual({ id: 2 })
    expect(rows).toEqual([
      expect.objectContaining({
        downPaymentId: 2,
        taxInvoiceId: 9,
        taxStatus: "fp-um-terbit",
        vatDpp: 1000000,
        vatAmount: 110000,
      }),
    ])
  })

  it("downPaymentId + confirmedOnly digabung di where", async () => {
    mocks.findDownPayments.mockResolvedValue([dpRow(2)])

    await loadDownPaymentTaxStatusRows({ downPaymentId: 2, confirmedOnly: true })

    expect(mocks.findDownPayments.mock.calls[0]?.[0]?.where).toEqual({
      status: "confirmed",
      id: 2,
    })
  })

  it("tanpa input: where kosong, include/orderBy lama utuh", async () => {
    mocks.findDownPayments.mockResolvedValue([dpRow(1), dpRow(2, "pending")])

    const rows = await loadDownPaymentTaxStatusRows()

    const arg = mocks.findDownPayments.mock.calls[0]?.[0]
    expect(arg.where).toEqual({})
    expect(arg.orderBy).toEqual({ paymentDate: "desc" })
    expect(arg.include).toEqual({
      customer: { select: { name: true } },
      taxInvoices: {
        where: { direction: "out" },
        orderBy: { id: "desc" },
        select: { id: true, taxInvoiceNumber: true, djpStatus: true },
      },
    })
    expect(rows.map((r: { downPaymentId: number }) => r.downPaymentId)).toEqual([1, 2])
  })

  it("downPaymentIds didorong ke where id-in (kontrak daftar terpaginasi)", async () => {
    mocks.findDownPayments.mockResolvedValue([dpRow(2), dpRow(5)])

    const rows = await loadDownPaymentTaxStatusRows({ downPaymentIds: [2, 5] })

    expect(mocks.findDownPayments.mock.calls[0]?.[0]?.where).toEqual({
      id: { in: [2, 5] },
    })
    expect(rows.map((r: { downPaymentId: number }) => r.downPaymentId)).toEqual([2, 5])
  })

  it("confirmedOnly saja: where status confirmed (kontrak laporan pajak)", async () => {
    mocks.findDownPayments.mockResolvedValue([dpRow(1)])

    await loadDownPaymentTaxStatusRows({ confirmedOnly: true })

    expect(mocks.findDownPayments.mock.calls[0]?.[0]?.where).toEqual({
      status: "confirmed",
    })
  })
})
