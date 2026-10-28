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
})
