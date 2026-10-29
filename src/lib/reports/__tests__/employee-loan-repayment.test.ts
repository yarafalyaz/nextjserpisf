import { describe, it, expect } from "vitest"
import {
  allocateLoanRepayment,
  evaluateLoanBudgetGuard,
  loanBudgetGuardMessage,
  totalAllocated,
} from "@/lib/reports/employee-loan-repayment"

describe("F-2026-10-29-162-V penjaga anggaran BR-LOAN-03 (PUT-LOAN-1, E162-1)", () => {
  it("E162-1: Σ potongan termasuk statutori > bruto = jebol (susun)", () => {
    const breach = evaluateLoanBudgetGuard({
      gross: 5000000,
      loanDeduction: 2000000,
      statutory: 2500000,
      otherDeductions: 1000000,
    })
    expect(breach).not.toBeNull()
    expect(loanBudgetGuardMessage(breach!, "susun")).toMatch(/BR-LOAN-03/)
  })

  it("E162-1: Σ potongan = bruto = lolos (batas pas)", () => {
    expect(
      evaluateLoanBudgetGuard({
        gross: 5000000,
        loanDeduction: 2000000,
        statutory: 2500000,
        otherDeductions: 500000,
      }),
    ).toBeNull()
  })

  it("E162-1: statutori saja menembus bruto = jebol (tanpa cicilan)", () => {
    expect(
      evaluateLoanBudgetGuard({
        gross: 3000000,
        loanDeduction: 0,
        statutory: 3100000,
        otherDeductions: 0,
      }),
    ).not.toBeNull()
  })

  it("E162-1: pesan bayar menyebut fase bayar, tanpa nominal gaji lawan", () => {
    const msg = loanBudgetGuardMessage({ totalDeductions: 6000000, gross: 5000000 }, "bayar")
    expect(msg).toMatch(/Pembayaran slip ditolak/)
  })
})

describe("F-2026-10-29-162-V alokasi pelunasan pinjaman (helper tunggal)", () => {
  it("E162-6: tertua-dulu (loanDate naik, seri id naik), dicap sisa utang tiap pinjaman", () => {
    const out = allocateLoanRepayment(
      [
        { id: 2, loanDate: "2026-02-01", remainingAmount: 500000 },
        { id: 1, loanDate: "2026-01-01", remainingAmount: 200000 },
      ],
      400000,
    )
    expect(out.map((o) => o.loanId)).toEqual([1, 2])
    expect(out[0]).toMatchObject({ applied: 200000, nextRemaining: 0, nextStatus: "paid_off" })
    expect(out[1]).toMatchObject({ applied: 200000, nextRemaining: 300000, nextStatus: "active" })
    expect(totalAllocated(out)).toBe(400000)
  })

  it("E162-6: loanDate sama = seri id naik", () => {
    const out = allocateLoanRepayment(
      [
        { id: 9, loanDate: "2026-01-01", remainingAmount: 100000 },
        { id: 3, loanDate: "2026-01-01", remainingAmount: 100000 },
      ],
      100000,
    )
    expect(out.map((o) => o.loanId)).toEqual([3])
  })

  it("E162-6: budget habis = pinjaman sisa tak tersentuh (tetap active)", () => {
    const out = allocateLoanRepayment(
      [
        { id: 1, loanDate: "2026-01-01", remainingAmount: 100000 },
        { id: 2, loanDate: "2026-02-01", remainingAmount: 900000 },
      ],
      50000,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ loanId: 1, applied: 50000, nextRemaining: 50000, nextStatus: "active" })
  })

  it("E162-6: sisa ≤ Rp1 dirapikan ke 0 (FIN-BR-006), bukan write-off", () => {
    const out = allocateLoanRepayment([{ id: 7, loanDate: "2026-01-01", remainingAmount: 0.6 }], 100)
    expect(out[0]).toMatchObject({ applied: 0.6, nextRemaining: 0, nextStatus: "paid_off" })
  })

  it("E162-6: pinjaman sisa 0 dilewati; budget 0 = tanpa alokasi", () => {
    expect(allocateLoanRepayment([{ id: 1, loanDate: "2026-01-01", remainingAmount: 0 }], 100)).toEqual([])
    expect(allocateLoanRepayment([{ id: 1, loanDate: "2026-01-01", remainingAmount: 100 }], 0)).toEqual([])
    expect(allocateLoanRepayment([{ id: 1, loanDate: "2026-01-01", remainingAmount: -5 }], 100)).toEqual([])
  })

  it("E162-6: sen dua desimal, tak pernah negatif", () => {
    const out = allocateLoanRepayment([{ id: 3, loanDate: "2026-01-01", remainingAmount: 100.005 }], 100.005)
    for (const o of out) {
      expect(o.applied).toBeGreaterThan(0)
      expect(o.nextRemaining).toBeGreaterThanOrEqual(0)
      expect(Number(o.applied.toFixed(2))).toBe(o.applied)
    }
  })
})
