import { describe, it, expect } from "vitest"
import {
  buildEmployeeLoanHistory,
  EMPLOYEE_LOAN_HISTORY_AGGREGATE_LABEL,
  EMPLOYEE_LOAN_HISTORY_NOTICE,
  type EmployeeLoanHistoryLoanInput,
  type EmployeeLoanHistoryPayrollInput,
} from "../employee-loan-history"

/**
 * Builder murni histori cicilan tahap 1 (F-2026-10-25-019-S,
 * AC-LH-B1/B2/B5 + EC-1/6/7). Falsifikasi alokasi: payload TIDAK
 * boleh memuat nominal per-pinjaman hasil karangan (BR-LH-04).
 */

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function loan(overrides: Partial<EmployeeLoanHistoryLoanInput> = {}): EmployeeLoanHistoryLoanInput {
  return {
    loanId: 11,
    loanDate: d("2026-01-15"),
    status: "active",
    totalAmount: 10_000_000,
    monthlyInstallment: 1_000_000,
    weeklyInstallment: null,
    remainingAmount: 7_000_000,
    ...overrides,
  }
}

function slip(overrides: Partial<EmployeeLoanHistoryPayrollInput> = {}): EmployeeLoanHistoryPayrollInput {
  return {
    payrollId: 101,
    documentNo: "PAY-2026-001",
    period: "2026-02",
    status: "paid",
    paymentDate: d("2026-02-28"),
    loanDeduction: 1_000_000,
    ...overrides,
  }
}

describe("buildEmployeeLoanHistory — agregat jujur tahap 1 (AC-LH-B1, BR-LH-03/04)", () => {
  it("3 slip paid tampil 3 baris agregat bertanda semua-pinjaman; terbayar kini dari fakta, bukan Σ slip", () => {
    const h = buildEmployeeLoanHistory({
      loan: loan(),
      payrolls: [
        slip(),
        slip({ payrollId: 102, documentNo: "PAY-2026-002", period: "2026-03", paymentDate: d("2026-03-31") }),
        slip({ payrollId: 103, documentNo: "PAY-2026-003", period: "2026-04", paymentDate: d("2026-04-30") }),
      ],
    })
    expect(h.notice).toBe(EMPLOYEE_LOAN_HISTORY_NOTICE)
    expect(h.entries).toHaveLength(3)
    for (const e of h.entries) {
      expect(e.kind).toBe("agregat-slip")
      expect(e.label).toBe(EMPLOYEE_LOAN_HISTORY_AGGREGATE_LABEL)
      if (e.kind === "agregat-slip") expect(e.aggregateDeduction).toBe(1_000_000)
    }
    // BR-LH-03: 10.000.000 − 7.000.000 (kebetulan sama Σ slip — invariant dari field, bukan penjumlahan).
    expect(h.totalPaidDerived).toBe(3_000_000)
  })

  it("FALSIFIKASI AC-LH-B1: payload tidak memuat alokasi per pinjaman karangan", () => {
    const h = buildEmployeeLoanHistory({ loan: loan(), payrolls: [slip()] })
    // Falsifikasi pada ENTRIES: tahap 1 tidak boleh ada baris ledger/
    // alokasi per pinjaman; nominal slip tetap agregat apa adanya.
    expect(h.entries.every((e) => e.kind === "agregat-slip")).toBe(true)
    expect(JSON.stringify(h.entries)).not.toContain("allocatedAmount")
    expect(h.verifiedAllocatedTotal).toBe(0)
    // Ember BR-LH-08 = seluruh terbayar kini selama ledger belum ada.
    expect(h.unallocatedAmount).toBe(h.totalPaidDerived)
    expect(h.unallocatedAmount).toBeGreaterThan(0)
  })

  it("terbayar kini TIDAK berubah walau Σ slip berbeda (cicilan master pernah diubah)", () => {
    const h = buildEmployeeLoanHistory({
      loan: loan({ remainingAmount: 8_500_000 }),
      payrolls: [slip({ loanDeduction: 3_000_000 })],
    })
    expect(h.totalPaidDerived).toBe(1_500_000)
    expect(h.unallocatedAmount).toBe(1_500_000)
  })
})

describe("buildEmployeeLoanHistory — dua pinjaman bersamaan (AC-LH-B2, BR-LH-08)", () => {
  it("pinjaman kedua melihat slip yang sama sebagai agregat — tidak ada baris per-pinjaman", () => {
    const payrolls = [
      slip({ loanDeduction: 1_500_000 }),
      slip({ payrollId: 102, documentNo: "PAY-2026-002", paymentDate: d("2026-03-31"), loanDeduction: 1_500_000 }),
    ]
    const a = buildEmployeeLoanHistory({ loan: loan({ remainingAmount: 8_000_000 }), payrolls })
    const b = buildEmployeeLoanHistory({
      loan: loan({ loanId: 12, totalAmount: 4_000_000, remainingAmount: 3_000_000 }),
      payrolls,
    })
    for (const h of [a, b]) {
      expect(h.entries.every((e) => e.kind === "agregat-slip")).toBe(true)
      expect(h.unallocatedAmount).toBe(h.totalPaidDerived)
    }
    expect(a.totalPaidDerived).toBe(2_000_000)
    expect(b.totalPaidDerived).toBe(1_000_000)
  })

  it("ember menyusut hanya oleh ledger terverifikasi (persiapan tahap 2), bukan tebakan", () => {
    const h = buildEmployeeLoanHistory({
      loan: loan(),
      payrolls: [slip()],
      ledger: [{ payrollId: 101, documentNo: "PAY-2026-001", paymentDate: d("2026-02-28"), amount: 400_000 }],
    })
    expect(h.verifiedAllocatedTotal).toBe(400_000)
    expect(h.unallocatedAmount).toBe(2_600_000)
    expect(h.entries.some((e) => e.kind === "ledger")).toBe(true)
  })
})

describe("buildEmployeeLoanHistory — slip belum paid & nol (AC-LH-B5, EC-6)", () => {
  it("draft/approved dibuang walau lolos ke builder; loanDeduction 0 tanpa baris", () => {
    const h = buildEmployeeLoanHistory({
      loan: loan(),
      payrolls: [
        slip({ status: "draft" }),
        slip({ payrollId: 102, status: "approved", documentNo: "PAY-2026-002" }),
        slip({ payrollId: 103, status: "paid", loanDeduction: 0, documentNo: "PAY-2026-003" }),
        slip({ payrollId: 104, status: "paid", documentNo: "PAY-2026-004" }),
      ],
    })
    expect(h.entries).toHaveLength(1)
    expect(h.entries[0].payrollId).toBe(104)
  })

  it("pinjaman paid_off tetap terbaca historinya (EC-1); tanpa slip = kosong jujur (EC-7)", () => {
    const paidOff = buildEmployeeLoanHistory({
      loan: loan({ status: "paid_off", remainingAmount: 0 }),
      payrolls: [slip()],
    })
    expect(paidOff.totalPaidDerived).toBe(10_000_000)
    expect(paidOff.entries).toHaveLength(1)

    const empty = buildEmployeeLoanHistory({ loan: loan({ remainingAmount: 10_000_000 }), payrolls: [] })
    expect(empty.entries).toEqual([])
    expect(empty.totalPaidDerived).toBe(0)
    expect(empty.unallocatedAmount).toBe(0)
  })

  it("perkiraan cicilan berikutnya: mingguan NULL tetap null, tidak dikonversi (BR-LH-07/EC-5)", () => {
    const h = buildEmployeeLoanHistory({ loan: loan(), payrolls: [] })
    expect(h.nextMonthlyInstallment).toBe(1_000_000)
    expect(h.nextWeeklyInstallment).toBeNull()

    const weekly = buildEmployeeLoanHistory({
      loan: loan({ weeklyInstallment: 250_000 }),
      payrolls: [],
    })
    expect(weekly.nextWeeklyInstallment).toBe(250_000)
  })
})
