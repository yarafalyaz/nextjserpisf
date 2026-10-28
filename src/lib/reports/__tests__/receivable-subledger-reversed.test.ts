import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  prismaMock: {
    customer: { findMany: vi.fn() },
    salesInvoice: { findMany: vi.fn() },
    salesPayment: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
    journal: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/reports/return-credit", () => ({
  loadReturnCreditByReturnId: vi.fn().mockResolvedValue(new Map()),
}))

import { loadReceivableSubledger } from "../ledger-cash-data"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.customer.findMany.mockResolvedValue([{ id: 7, slug: "c-7" }])
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
  mocks.prismaMock.salesPayment.findMany.mockResolvedValue([])
  mocks.prismaMock.salesReturn.findMany.mockResolvedValue([])
  mocks.prismaMock.journal.findMany.mockResolvedValue([])
})

describe("FIN-BR-008 buku pembantu piutang (loader)", () => {
  it("query pembayaran subledger memakai status bukan-reversed", async () => {
    await loadReceivableSubledger(
      { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) },
      "c-7",
    )
    expect(mocks.prismaMock.salesPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "reversed" } }),
      }),
    )
  })
})
