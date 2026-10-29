import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader subledger komisi (F-2026-10-25-049-S): view_reports fail-closed;
 * tahap 3 live → ledgerAvailable:true dari baris fisik (QA-KOM49-7 baca
 * tidak menulis).
 */

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), findMany: vi.fn() }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { commissionPayable: { findMany: (...a: unknown[]) => mocks.findMany(...a) } },
}))

import { getSalesCommissionSubledgerRecap } from "../sales-commission-subledger-data"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: "5", roles: ["admin"], permissions: ["view_reports"] })
  mocks.findMany.mockResolvedValue([])
})

describe("getSalesCommissionSubledgerRecap", () => {
  it("menegakkan view_reports; tanpa izin menolak tanpa muatan", async () => {
    await getSalesCommissionSubledgerRecap()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getSalesCommissionSubledgerRecap()).rejects.toThrow("Tidak memiliki izin")
  })

  it("tahap 3 live: ledgerAvailable true, saldo 0 tercatat, status kosong", async () => {
    const r = await getSalesCommissionSubledgerRecap()
    expect(r.payable).toMatchObject({ ledgerAvailable: true, totalBalance: 0, rows: [] })
    expect(r.lineStatuses).toEqual([])
  })

  it("tanpa where (saldo kumulatif); select hanya kolom dipakai; keluaran campuran utuh", async () => {
    mocks.findMany.mockResolvedValue([
      {
        salesInvoiceId: 1,
        salesEmployeeId: 9,
        salesEmployee: { name: "Joko" },
        accruedAmount: { toString: () => "100" } as never,
        reversalAmount: { toString: () => "0" } as never,
        paidAmount: { toString: () => "40" } as never,
      },
      {
        // Baris nol tetap lahirkan row + status ACCRUED — tak boleh disaring DB.
        salesInvoiceId: 2,
        salesEmployeeId: 9,
        salesEmployee: { name: "Joko" },
        accruedAmount: { toString: () => "0" } as never,
        reversalAmount: { toString: () => "0" } as never,
        paidAmount: { toString: () => "0" } as never,
      },
    ])

    const r = await getSalesCommissionSubledgerRecap()

    const arg = mocks.findMany.mock.calls[0]?.[0] as {
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
    expect(r.payable.rows[0].lines).toHaveLength(2)
    expect(r.payable.totalBalance).toBe(60)
    expect(r.lineStatuses).toEqual([
      { salesInvoiceId: 1, salesEmployeeId: 9, status: "PARTIALLY_PAID" },
      { salesInvoiceId: 2, salesEmployeeId: 9, status: "ACCRUED" },
    ])
  })
})
