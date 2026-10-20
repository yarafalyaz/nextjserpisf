import { describe, it, expect } from "vitest"
import { buildCashProjectionInputs } from "../cash-projection-data"

describe("buildCashProjectionInputs (F-48a)", () => {
  it("payables pakai sisa NETO (grandTotal − withholding − paid): PPh tidak pernah dibayar ke supplier", () => {
    const due = new Date(2026, 10, 15)
    const { payables } = buildCashProjectionInputs({
      invoices: [],
      bills: [{ dueDate: due, grandTotal: 10_000_000.1, withholdingAmount: 200_000, paidAmount: 3_000_000.1 }],
    })
    // Neto = 10.000.000,10 − 200.000 − 3.000.000,10 = 6.800.000,00.
    // Bruto lama = 7.000.000,00 (overstate sebesar PPh).
    expect(payables).toEqual([{ dueDate: due, amount: 6_800_000 }])
  })

  it("receivables = grandTotal − paid presisi sen; payables tanpa withholding dihitung sama seperti rumus neto", () => {
    const due = new Date(2026, 10, 1)
    const { receivables, payables } = buildCashProjectionInputs({
      invoices: [{ dueDate: due, grandTotal: 10_000_000.1, paidAmount: 0.1 }],
      bills: [
        { dueDate: due, grandTotal: 5_000_000.2, withholdingAmount: null, paidAmount: 0.2 },
        { dueDate: due, grandTotal: 1_000, withholdingAmount: 0, paidAmount: 1_000 },
      ],
    })
    expect(receivables).toEqual([{ dueDate: due, amount: 10_000_000 }])
    // Bill kedua lunas (neto 0) -> tersaring keluar.
    expect(payables).toEqual([{ dueDate: due, amount: 5_000_000 }])
  })

  it("baris lunas / kelebihan bayar tersaring; uang presisi sen tidak drift float", () => {
    const due = new Date(2026, 11, 1)
    const { receivables, payables } = buildCashProjectionInputs({
      invoices: [
        { dueDate: due, grandTotal: 100.1, paidAmount: 100.1 },
        ...Array.from({ length: 10 }, () => ({ dueDate: due, grandTotal: 0.1, paidAmount: 0 })),
      ],
      bills: [{ dueDate: due, grandTotal: 50, withholdingAmount: 60, paidAmount: 0 }],
    })
    // 10 x 0,10 di-float mentah = 0,999999...; page menyaring amount > 0 per dokumen,
    // builder mempertahankan 10 baris 0,1 (bucket menggabung presisi sen di projectCash).
    expect(receivables).toHaveLength(10)
    expect(receivables.every((r) => r.amount === 0.1)).toBe(true)
    expect(payables).toEqual([])
  })
})
