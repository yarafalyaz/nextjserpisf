import { describe, it, expect } from "vitest"

/**
 * Status turunan subledger komisi (F-2026-10-25-049-S, vonis 049-V §3).
 * Agregasi saldo dikunci builder #911 (sales-commission-payable.test.ts);
 * di sini hanya status per baris dari A/R/P (QA-KOM49-6) + ikatan bahwa
 * saldo view == agregat builder atas masukan sama.
 */

import { buildSalesCommissionSubledger } from "../sales-commission-subledger"

const e = (id: number, a: number, r: number, p: number) => ({
  salesInvoiceId: id,
  salesEmployeeId: 2,
  salesEmployeeName: "Sari",
  accruedAmount: a,
  reversalAmount: r,
  paidAmount: p,
})

describe("buildSalesCommissionSubledger — status turunan 049-V §3", () => {
  it("peta status lengkap: ACCRUED, lawan parsial tetap ACCRUED, PARTIALLY_PAID, PAID, REVERSED, OVERPAID", () => {
    const v = buildSalesCommissionSubledger([
      e(1, 100000, 0, 0),
      e(2, 100000, 25000, 0),
      e(3, 100000, 0, 40000),
      e(4, 100000, 25000, 75000),
      e(5, 100000, 100000, 0),
      e(6, 100000, 30000, 100000),
    ])
    expect(v.lineStatuses.map((l) => l.status)).toEqual([
      "ACCRUED",
      "ACCRUED",
      "PARTIALLY_PAID",
      "PAID",
      "REVERSED",
      "OVERPAID_NEGATIVE",
    ])
  })

  it("saldo view identik agregat builder saldo atas masukan sama (per penerima terpisah)", () => {
    const v = buildSalesCommissionSubledger([
      e(10, 100000, 25000, 50000),
      { ...e(11, 30000.5, 0, 10000.25), salesEmployeeId: 1, salesEmployeeName: "Budi" },
    ])
    expect(v.payable.rows.map((x) => x.salesEmployeeId)).toEqual([1, 2])
    expect(v.payable.totalBalance).toBe(45000.25)
    expect(v.lineStatuses).toHaveLength(2)
  })

  it("REVERSED menang atas terbayar: lawan penuh + P>0 tetap REVERSED (vonis §3: R = A)", () => {
    const v = buildSalesCommissionSubledger([e(9, 100000, 100000, 40000)])
    expect(v.lineStatuses[0].status).toBe("REVERSED")
  })

  it("kosong: payable ledgerAvailable true kosong dari builder ini; status nol", () => {
    const v = buildSalesCommissionSubledger([])
    expect(v.payable.rows).toEqual([])
    expect(v.lineStatuses).toEqual([])
  })
})
