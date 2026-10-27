import { describe, it, expect } from "vitest"

import { getSalesCommissionPayable } from "../sales-commission-payable-data"
import { SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE } from "../sales-commission-payable"

describe("getSalesCommissionPayable (inti tahap 3 belum live)", () => {
  it("saldo 0 berlabel jujur dari builder — bukan saldo dari rekap (BR-KOM37-12)", async () => {
    const report = await getSalesCommissionPayable()
    expect(report).toEqual({
      ledgerAvailable: false,
      rows: [],
      totalBalance: 0,
      reconciliations: [],
      notice: SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE,
    })
    // Label persis (bukan parafrase): berubah di builder = tes ini MERAH.
    expect(report.notice).toBe(
      "Subledger dan jurnal utang komisi belum tersedia (inti tahap 3 belum live) — saldo utang komisi terbaca 0; rekap informatif tetap bukan utang.",
    )
  })
})
