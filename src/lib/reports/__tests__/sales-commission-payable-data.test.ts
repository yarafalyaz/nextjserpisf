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

  it("tanpa where (saldo kumulatif, tak ada filter ekuivalen); select hanya kolom dipakai", async () => {
    vi.mocked(prisma.commissionPayable.findMany).mockResolvedValue([
      {
        salesInvoiceId: 1,
        salesEmployeeId: 9,
        salesEmployee: { name: "Joko" },
        accruedAmount: { toString: () => "100" } as never,
        reversalAmount: { toString: () => "0" } as never,
        paidAmount: { toString: () => "40" } as never,
      },
      {
        // Baris nol tetap lahirkan row + baris di builder — menyaringnya
        // di DB akan mengubah keluaran, jadi tidak boleh ada where.
        salesInvoiceId: 2,
        salesEmployeeId: 9,
        salesEmployee: { name: "Joko" },
        accruedAmount: { toString: () => "0" } as never,
        reversalAmount: { toString: () => "0" } as never,
        paidAmount: { toString: () => "0" } as never,
      },
    ] as never)

    const report = await getSalesCommissionPayable()

    const arg = vi.mocked(prisma.commissionPayable.findMany).mock.calls[0]?.[0] as {
      where?: unknown
      select?: unknown
      orderBy?: unknown
    }
    expect(arg.where).toBeUndefined()
    expect(arg.orderBy).toEqual({ id: "asc" })
    expect(arg.select).toEqual({
      salesInvoiceId: true,
      salesEmployeeId: true,
      accruedAmount: true,
      reversalAmount: true,
      paidAmount: true,
      salesEmployee: { select: { name: true } },
    })
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].lines).toHaveLength(2)
    expect(report.totalBalance).toBe(60)
  })
})
