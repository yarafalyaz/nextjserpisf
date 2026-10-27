import { describe, it, expect, vi } from "vitest"

// Letterhead menarik auth (next-auth/next/server) yang tidak ter-resolve di
// vitest; builder yang diuji murni — mock permukaan beratnya saja.
vi.mock("@/components/reports/report-letterhead", () => ({ ReportLetterhead: () => null }))

import { buildAgingRows } from "../aging-report-view"

const NOW = new Date("2026-10-24T05:00:00.000Z")
const DUE = new Date("2026-10-10T00:00:00.000Z")

/**
 * F-104-V pasangan UI PR Backend #748: sisa layar Piutang Jatuh Tempo
 * kurangi returnCredit per faktur (grandTotal − paidAmount − returnCredit);
 * tanpa field itu perilaku lama persis (permukaan hutang).
 */
describe("buildAgingRows returnCredit (F-104-V)", () => {
  it("returnCredit kurangi sisa sen persis; faktur lunas oleh retur keluar", () => {
    const rows = buildAgingRows(
      [
        { party: "A", documentNo: "INV-1", dueDate: DUE, grandTotal: 1_000_000, paidAmount: 200_000, returnCreditAmount: 100_000 },
        { party: "B", documentNo: "INV-2", dueDate: DUE, grandTotal: 500_000, paidAmount: 400_000, returnCreditAmount: 100_000 },
      ],
      NOW,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].documentNo).toBe("INV-1")
    expect(rows[0].outstanding).toBe(700_000)
  })

  it("tanpa returnCreditAmount rumus lama persis", () => {
    const rows = buildAgingRows(
      [{ party: "A", documentNo: "INV-1", dueDate: DUE, grandTotal: 1_000_000, paidAmount: 200_000 }],
      NOW,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].outstanding).toBe(800_000)
  })
})
