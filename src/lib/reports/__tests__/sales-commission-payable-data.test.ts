import { describe, it, expect, vi, beforeEach } from "vitest"

import { getSalesCommissionPayable } from "../sales-commission-payable-data"

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    commissionPayable: { findMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/db/prisma"

describe("getSalesCommissionPayable (tahap 3 live)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("tanpa baris = ledgerAvailable true, saldo 0 tercatat (bukan belum live)", async () => {
    vi.mocked(prisma.commissionPayable.findMany).mockResolvedValue([])
    const report = await getSalesCommissionPayable()
    expect(report.ledgerAvailable).toBe(true)
    expect(report.rows).toEqual([])
    expect(report.totalBalance).toBe(0)
  })

  it("baris subledger diagregat per penerima", async () => {
    vi.mocked(prisma.commissionPayable.findMany).mockResolvedValue([
      {
        salesInvoiceId: 1,
        salesEmployeeId: 9,
        salesEmployee: { name: "Joko" },
        accruedAmount: { toString: () => "220000" } as never,
        reversalAmount: { toString: () => "0" } as never,
        paidAmount: { toString: () => "0" } as never,
      },
    ] as never)
    const report = await getSalesCommissionPayable()
    expect(report.ledgerAvailable).toBe(true)
    expect(report.rows).toHaveLength(1)
    expect(report.totalBalance).toBe(220000)
  })
})
