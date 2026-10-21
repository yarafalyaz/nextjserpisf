import { describe, it, expect, vi } from "vitest"

/**
 * Rekap komisi informatif (F-2026-10-21-016 tahap 2). Yang dijaga:
 * agregasi per snapshot penjual dari faktur lunas, persen per baris
 * diterapkan ke grandTotal baris itu, tanpa penjual masuk unattributed
 * (tidak ditebak), loader hanya status paid + satu query massal.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: { salesInvoice: { findMany: vi.fn() } },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getSalesCommissionRecap } from "../sales-commission-data"
import { buildSalesCommissionRecap, SALES_COMMISSION_NOTICE } from "../sales-commission"

describe("buildSalesCommissionRecap", () => {
  it("agregasi per penjual; persen per baris; urut paidBase terbesar", () => {
    const r = buildSalesCommissionRecap([
      { salesEmployeeId: 2, salesEmployeeName: "Sari", grandTotal: 1000000, commissionPercent: 2 },
      { salesEmployeeId: 1, salesEmployeeName: "Budi", grandTotal: 500000, commissionPercent: 3 },
      { salesEmployeeId: 2, salesEmployeeName: "Sari", grandTotal: 250000.5, commissionPercent: 2 },
    ])
    expect(r.rows.map((row) => row.salesEmployeeId)).toEqual([2, 1])
    expect(r.rows[0].invoiceCount).toBe(2)
    expect(r.rows[0].paidBase).toBe(1250000.5)
    expect(r.rows[0].estimatedCommission).toBe(25000.01)
    expect(r.rows[1].estimatedCommission).toBe(15000)
    expect(r.totalPaidBase).toBe(1750000.5)
    expect(r.totalEstimatedCommission).toBe(40000.01)
    expect(r.notice).toBe(SALES_COMMISSION_NOTICE)
  })

  it("tanpa penjual masuk unattributed, tidak masuk rows", () => {
    const r = buildSalesCommissionRecap([
      { salesEmployeeId: null, salesEmployeeName: null, grandTotal: 700000, commissionPercent: 5 },
      { salesEmployeeId: 1, salesEmployeeName: "Budi", grandTotal: 300000, commissionPercent: 0 },
    ])
    expect(r.rows).toHaveLength(1)
    expect(r.unattributed).toEqual({ invoiceCount: 1, paidBase: 700000 })
    expect(r.totalPaidBase).toBe(1000000)
    expect(r.rows[0].estimatedCommission).toBe(0) // persen 0 = tarif belum diatur
  })

  it("kosong: rows kosong, total 0, notice tetap jujur", () => {
    const r = buildSalesCommissionRecap([])
    expect(r.rows).toEqual([])
    expect(r.totalPaidBase).toBe(0)
    expect(r.notice).toMatch(/bukan utang komisi/)
  })

  it("loader: hanya paid belum-terhapus dalam periode + persen 0 jujur", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { salesEmployeeId: 7, grandTotal: 100000, salesEmployee: { name: "Rina" } },
      { salesEmployeeId: null, grandTotal: 50000, salesEmployee: null },
    ])
    const r = await getSalesCommissionRecap({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledTimes(1)
    const where = mocks.prismaMock.salesInvoice.findMany.mock.calls[0][0].where
    expect(where.status).toBe("paid")
    expect(where.deletedAt).toBeNull()
    expect(r.rows[0].salesEmployeeName).toBe("Rina")
    expect(r.rows[0].estimatedCommission).toBe(0)
    expect(r.unattributed.paidBase).toBe(50000)
  })
})
