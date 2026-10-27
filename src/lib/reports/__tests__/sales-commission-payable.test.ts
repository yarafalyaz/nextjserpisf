import { describe, it, expect } from "vitest"

/**
 * Read-model saldo utang komisi (F-2026-10-25-037-S §5, persiapan tahap 3).
 * Yang dijaga: saldo = akrual − lawan − terbayar per faktur; lawan > akrual
 * dan saldo negatif sesudah terbayar = baris rekonsiliasi beralasan (bukan
 * clamp); ledger belum live → nol berlabel jujur (rekap bukan utang).
 */

import {
  buildSalesCommissionPayable,
  COMMISSION_LEDGER_NEGATIVE_REASON,
  COMMISSION_LEDGER_OVERRUN_REASON,
  SALES_COMMISSION_PAYABLE_NOTICE,
  SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE,
} from "../sales-commission-payable"

describe("buildSalesCommissionPayable", () => {
  it("ledger belum live: kosong, total 0, label belum-tersedia (bukan label utang)", () => {
    const r = buildSalesCommissionPayable(
      [{ salesInvoiceId: 1, salesEmployeeId: 9, salesEmployeeName: "X", accruedAmount: 999, reversalAmount: 0, paidAmount: 0 }],
      { ledgerAvailable: false },
    )
    expect(r).toEqual({
      ledgerAvailable: false,
      rows: [],
      totalBalance: 0,
      reconciliations: [],
      notice: SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE,
    })
  })

  it("saldo per faktur direkonsiliasi; agregat per penjual; total konsisten (AC-KOM37-7)", () => {
    const r = buildSalesCommissionPayable(
      [
        { salesInvoiceId: 10, salesEmployeeId: 2, salesEmployeeName: "Sari", accruedAmount: 100000, reversalAmount: 25000, paidAmount: 50000 },
        { salesInvoiceId: 11, salesEmployeeId: 2, salesEmployeeName: "Sari", accruedAmount: 40000, reversalAmount: 0, paidAmount: 0 },
        { salesInvoiceId: 12, salesEmployeeId: 1, salesEmployeeName: "Budi", accruedAmount: 30000.5, reversalAmount: 0, paidAmount: 10000.25 },
      ],
      { ledgerAvailable: true },
    )
    expect(r.notice).toBe(SALES_COMMISSION_PAYABLE_NOTICE)
    expect(r.rows.map((x) => x.salesEmployeeId)).toEqual([1, 2])
    expect(r.rows[1]).toMatchObject({ accruedAmount: 140000, reversalAmount: 25000, paidAmount: 50000, balance: 65000 })
    expect(r.rows[1].lines[0]).toMatchObject({ salesInvoiceId: 10, balance: 25000 })
    expect(r.rows[0].balance).toBe(20000.25)
    expect(r.totalBalance).toBe(85000.25)
    expect(r.reconciliations).toEqual([])
  })

  it("lawan > akrual: baris rekonsiliasi lawan-melebihi-akrual, saldo TIDAK di-clamp", () => {
    const r = buildSalesCommissionPayable(
      [{ salesInvoiceId: 20, salesEmployeeId: 3, salesEmployeeName: "Rina", accruedAmount: 10000, reversalAmount: 15000, paidAmount: 0 }],
      { ledgerAvailable: true },
    )
    expect(r.rows[0].balance).toBe(-5000)
    expect(r.reconciliations).toEqual([
      { salesInvoiceId: 20, salesEmployeeId: 3, reason: COMMISSION_LEDGER_OVERRUN_REASON },
    ])
  })

  it("terbayar penuh lalu retur: saldo negatif tercatat + alasan retur-sesudah-terbayar (BR-KOM37-08)", () => {
    const r = buildSalesCommissionPayable(
      [{ salesInvoiceId: 21, salesEmployeeId: 3, salesEmployeeName: "Rina", accruedAmount: 10000, reversalAmount: 4000, paidAmount: 10000 }],
      { ledgerAvailable: true },
    )
    expect(r.rows[0].balance).toBe(-4000)
    expect(r.reconciliations).toEqual([
      { salesInvoiceId: 21, salesEmployeeId: 3, reason: COMMISSION_LEDGER_NEGATIVE_REASON },
    ])
  })
})
