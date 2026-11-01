import { describe, it, expect, vi, beforeEach } from "vitest"

const salesPaymentCount = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: { salesPayment: { count: (...a: unknown[]) => salesPaymentCount(...a) } },
}))

import { hasRealSettlement, salesOrderHasRealSettlement, quotationHasRealSettlement } from "../sales-settlement.service"

beforeEach(() => {
  vi.clearAllMocks()
  salesPaymentCount.mockResolvedValue(1)
})

describe("FIN-BR-008 settlement (loader)", () => {
  it("hasRealSettlement mengecualikan baris reversed", async () => {
    await hasRealSettlement(5)
    expect(salesPaymentCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          salesInvoiceId: 5,
          status: { not: "reversed" },
        }),
      }),
    )
  })

  it("salesOrderHasRealSettlement mengecualikan baris reversed", async () => {
    await salesOrderHasRealSettlement(6)
    expect(salesPaymentCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "reversed" } }),
      }),
    )
  })

  it("quotationHasRealSettlement mengecualikan baris reversed", async () => {
    await quotationHasRealSettlement(7)
    expect(salesPaymentCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "reversed" } }),
      }),
    )
  })

  // Regresi putaran 44: faktur yang dibuat DARI pesanan (salesOrderId) tidak
  // mewarisi quotationId pesanan — pembayaran nyata atas faktur itu adalah
  // pelunasan ekonomi penawaran yang mendasarinya, tetapi filter lama hanya
  // melihat faktur direct `quotationId` sehingga penawaran tetap bisa
  // diedit sesudah turunannya dibayar. Filter wajib mencakup kedua jembatan.
  it("regresi putaran 44: quotationHasRealSettlement mencakup faktur lewat pesanan", async () => {
    await quotationHasRealSettlement(7)
    expect(salesPaymentCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          salesInvoice: {
            OR: [{ quotationId: 7 }, { salesOrder: { quotationId: 7 } }],
          },
        }),
      }),
    )
  })
})
