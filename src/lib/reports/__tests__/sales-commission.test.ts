import { describe, it, expect, vi } from "vitest"

/**
 * Rekap komisi informatif (F-2026-10-21-016 tahap 2 + F-2026-10-25-036-S).
 * Yang dijaga: basis DPP (grandTotal − taxAmount, AC-KT-1), estimasi dari
 * persen snapshot faktur, pengurang retur masa retur dgn persen faktur asal
 * (AC-KT-7), neto negatif tanpa clamp (AC-KT-9), tanpa penjual masuk
 * unattributed, loader paid-only + snapshot persen (null = 0 jujur).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    salesInvoice: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getSalesCommissionRecap } from "../sales-commission-data"
import { buildSalesCommissionRecap, SALES_COMMISSION_NOTICE } from "../sales-commission"

describe("buildSalesCommissionRecap", () => {
  it("AC-KT-1: basis DPP bukan grandTotal — DPP 11jt + PPN 1,32jt @2% = 220.000", () => {
    const r = buildSalesCommissionRecap([
      { salesEmployeeId: 1, salesEmployeeName: "Budi", grandTotal: 12320000, taxAmount: 1320000, commissionPercent: 2 },
    ])
    expect(r.rows[0].dppBase).toBe(11000000)
    expect(r.rows[0].paidBase).toBe(12320000) // kolom lama tetap grandTotal
    expect(r.rows[0].estimatedCommission).toBe(220000) // basis grandTotal = 246.400 MERAH
    expect(r.totalDppBase).toBe(11000000)
  })

  it("agregasi per penjual; persen snapshot per baris; urut dppBase terbesar", () => {
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

  it("faktur tanpa PPN: basis DPP = grandTotal penuh (BR-KT36-05)", () => {
    const r = buildSalesCommissionRecap([
      { salesEmployeeId: 1, salesEmployeeName: "Budi", grandTotal: 1000000, taxAmount: 0, commissionPercent: 5 },
    ])
    expect(r.rows[0].dppBase).toBe(1000000)
    expect(r.rows[0].estimatedCommission).toBe(50000)
  })

  it("AC-KT-5/13: persen 0 jujur (tanpa snapshot) — estimasi 0, rekap tetap tampil", () => {
    const r = buildSalesCommissionRecap([
      { salesEmployeeId: 1, salesEmployeeName: "Budi", grandTotal: 1000000, taxAmount: 100000, commissionPercent: 0 },
    ])
    expect(r.rows[0].dppBase).toBe(900000)
    expect(r.rows[0].estimatedCommission).toBe(0)
    expect(r.notice).toMatch(/Basis komisi adalah DPP/)
  })

  it("AC-KT-7: retur returnDpp 1jt atas faktur @2% = pengurang 20.000 penjual asal", () => {
    const r = buildSalesCommissionRecap(
      [{ salesEmployeeId: 1, salesEmployeeName: "Budi", grandTotal: 12320000, taxAmount: 1320000, commissionPercent: 2 }],
      [{ salesEmployeeId: 1, salesEmployeeName: "Budi", returnDppTotal: 1000000, commissionPercent: 2 }],
    )
    expect(r.rows[0].estimatedCommission).toBe(220000)
    expect(r.rows[0].returnDeduction).toBe(20000)
    expect(r.rows[0].netEstimatedCommission).toBe(200000)
    expect(r.rows[0].dppBase).toBe(11000000) // basis masa faktur tidak ditulis ulang
  })

  it("AC-KT-9: neto negatif tampil apa adanya tanpa clamp", () => {
    const r = buildSalesCommissionRecap(
      [],
      [{ salesEmployeeId: 1, salesEmployeeName: "Budi", returnDppTotal: 1000000, commissionPercent: 2 }],
    )
    expect(r.rows[0].netEstimatedCommission).toBe(-20000)
    expect(r.totalNetEstimatedCommission).toBe(-20000)
  })

  it("tanpa penjual masuk unattributed, tidak masuk rows", () => {
    const r = buildSalesCommissionRecap([
      { salesEmployeeId: null, salesEmployeeName: null, grandTotal: 700000, commissionPercent: 5 },
      { salesEmployeeId: 1, salesEmployeeName: "Budi", grandTotal: 300000, commissionPercent: 0 },
    ])
    expect(r.rows).toHaveLength(1)
    expect(r.unattributed).toEqual({ invoiceCount: 1, paidBase: 700000, dppBase: 700000 })
    expect(r.totalPaidBase).toBe(1000000)
    expect(r.rows[0].estimatedCommission).toBe(0)
  })

  it("kosong: rows kosong, total 0, notice tetap jujur", () => {
    const r = buildSalesCommissionRecap([])
    expect(r.rows).toEqual([])
    expect(r.totalPaidBase).toBe(0)
    expect(r.notice).toMatch(/bukan utang komisi/)
  })

  it("loader: paid belum-terhapus + snapshot persen; lama null = 0 jujur; retur masa retur", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, salesEmployeeId: 7, grandTotal: 12320000, taxAmount: 1320000, commissionRatePercent: 2, salesEmployee: { name: "Rina" } },
      { id: 12, salesEmployeeId: null, grandTotal: 50000, taxAmount: 0, commissionRatePercent: null, salesEmployee: null },
    ])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([
      {
        id: 21,
        salesInvoiceId: 11,
        items: [{ qty: 1, price: 1000000, returnDpp: 1000000 }],
        salesInvoice: { salesEmployeeId: 7, commissionRatePercent: 2, salesEmployee: { name: "Rina" } },
      },
    ])
    const r = await getSalesCommissionRecap({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    const where = mocks.prismaMock.salesInvoice.findMany.mock.calls[0][0].where
    expect(where.status).toBe("paid")
    expect(where.deletedAt).toBeNull()
    const retWhere = mocks.prismaMock.salesReturn.findMany.mock.calls[0][0].where
    expect(retWhere.status).toBe("completed")
    expect(r.rows[0].salesEmployeeName).toBe("Rina")
    expect(r.rows[0].estimatedCommission).toBe(220000)
    expect(r.rows[0].returnDeduction).toBe(20000)
    expect(r.unattributed.paidBase).toBe(50000)
    // loader read-only: tidak ada mutasi tertulis
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledTimes(1)
  })
})
