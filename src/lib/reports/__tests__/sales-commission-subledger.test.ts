import { describe, it, expect } from "vitest"

/**
 * Subledger komisi per penerima (F-2026-10-25-049-S, vonis 049-V §3/§6).
 * Yang dijaga: status turunan murni dari A/R/P (QA-KOM49-6), saldo per
 * penerima = agregat baris (QA-KOM49-1 turunan baca), lawan > akrual dan
 * saldo negatif = rekonsiliasi beralasan tanpa clamp (QA-KOM49-4/5).
 */

import { buildSalesCommissionSubledger } from "../sales-commission-subledger"
import {
  COMMISSION_LEDGER_NEGATIVE_REASON,
  COMMISSION_LEDGER_OVERRUN_REASON,
} from "../sales-commission-payable"

const e = (
  salesInvoiceId: number,
  salesEmployeeId: number,
  accruedAmount: number,
  reversalAmount: number,
  paidAmount: number,
  salesEmployeeName: string | null = "Sari",
) => ({ salesInvoiceId, salesEmployeeId, salesEmployeeName, accruedAmount, reversalAmount, paidAmount })

describe("buildSalesCommissionSubledger — status turunan vonis 049-V §3", () => {
  it("ACCRUED: R=0 P=0; lawan parsial tetap ACCRUED atas sisa (bukan status sendiri)", () => {
    const r = buildSalesCommissionSubledger([e(1, 2, 100000, 0, 0), e(2, 2, 100000, 25000, 0)])
    expect(r.rows[0].lines.map((l) => l.status)).toEqual(["ACCRUED", "ACCRUED"])
  })

  it("PARTIALLY_PAID / PAID / REVERSED dari angka, bukan input", () => {
    const r = buildSalesCommissionSubledger([
      e(1, 2, 100000, 0, 40000),
      e(2, 2, 100000, 25000, 75000),
      e(3, 2, 100000, 100000, 0),
    ])
    expect(r.rows[0].lines.map((l) => l.status)).toEqual([
      "PARTIALLY_PAID",
      "PAID",
      "REVERSED",
    ])
  })

  it("OVERPAID_NEGATIVE: terbayar penuh lalu lawan lahir — saldo negatif tanpa clamp (QA-KOM49-5)", () => {
    const r = buildSalesCommissionSubledger([e(1, 2, 100000, 30000, 100000)])
    expect(r.rows[0].lines[0].status).toBe("OVERPAID_NEGATIVE")
    expect(r.rows[0].lines[0].balance).toBe(-30000)
    expect(r.rows[0].balance).toBe(-30000)
    expect(r.reconciliations).toEqual([
      { salesInvoiceId: 1, salesEmployeeId: 2, reason: COMMISSION_LEDGER_NEGATIVE_REASON },
    ])
  })

  it("lawan > akrual: rekonsiliasi lawan-melebihi-akrual, nominal tidak di-clamp (QA-KOM49-4 sisi baca)", () => {
    const r = buildSalesCommissionSubledger([e(1, 2, 10000, 15000, 0)])
    expect(r.rows[0].lines[0].balance).toBe(-5000)
    expect(r.reconciliations).toEqual([
      { salesInvoiceId: 1, salesEmployeeId: 2, reason: COMMISSION_LEDGER_OVERRUN_REASON },
    ])
  })

  it("saldo per penerima = agregat baris subledger; penerima terpisah tidak tercampur", () => {
    const r = buildSalesCommissionSubledger([
      e(10, 2, 100000, 25000, 50000),
      e(11, 2, 40000, 0, 0),
      e(12, 1, 30000.5, 0, 10000.25, "Budi"),
    ])
    expect(r.rows.map((x) => x.salesEmployeeId)).toEqual([1, 2])
    expect(r.rows[1]).toMatchObject({
      accruedAmount: 140000,
      reversalAmount: 25000,
      paidAmount: 50000,
      balance: 65000,
    })
    expect(r.rows[0].balance).toBe(20000.25)
    expect(r.totalBalance).toBe(85000.25)
    // Agregat baris == total: cabut agregasi per baris -> MERAH.
    const lineSum = r.rows.flatMap((x) => x.lines).reduce((s, l) => s + l.balance, 0)
    expect(Math.round(lineSum * 100) / 100).toBe(r.totalBalance)
  })

  it("REVERSED menang atas terbayar: lawan penuh + P>0 tetap REVERSED, bukan OVERPAID (vonis §3: R = A)", () => {
    const r = buildSalesCommissionSubledger([e(9, 2, 100000, 100000, 40000)])
    expect(r.rows[0].lines[0].status).toBe("REVERSED")
    expect(r.rows[0].lines[0].balance).toBe(-40000)
  })

  it("kosong: nol baris, total 0, nol rekonsiliasi", () => {
    expect(buildSalesCommissionSubledger([])).toEqual({
      rows: [],
      totalBalance: 0,
      reconciliations: [],
    })
  })
})
