import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  prismaMock: {
    vendor: { findFirst: vi.fn() },
    vendorBill: { findMany: vi.fn() },
    vendorPayment: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadPayableSubledger } from "../ledger-cash-data"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 9 })
  mocks.prismaMock.vendorBill.findMany.mockResolvedValue([
    { documentNo: "VB-1", date: new Date(2026, 9, 3), grandTotal: 1_000_000, withholdingAmount: 20_000 },
  ])
  mocks.prismaMock.vendorPayment.findMany.mockResolvedValue([
    { documentNo: "VP-C", paymentDate: new Date(2026, 9, 5), amount: 200_000 },
  ])
})

describe("buku pembantu utang (loader)", () => {
  it("query pembayaran hanya completed — draft & reversed tidak mengurangi saldo", async () => {
    const view = await loadPayableSubledger(
      { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) },
      "v-9",
    )
    expect(mocks.prismaMock.vendorPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ vendorId: 9, status: "completed", deletedAt: null }),
      }),
    )
    // Saldo akhir: kredit neto PPh 980.000 − completed 200.000 = 780.000.
    const total = view.table.rows.at(-1)
    expect(total?.kind).toBe("total")
    if (total?.kind === "total") expect(total.cells[2]).toContain("780")
  })
})
