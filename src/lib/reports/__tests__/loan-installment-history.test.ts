import { describe, it, expect } from "vitest"

import {
  buildLoanInstallmentHistory,
  LOAN_INSTALLMENT_AGGREGATE_LABEL,
  LOAN_INSTALLMENT_HISTORY_EMPTY_LABEL,
  LOAN_INSTALLMENT_LEDGER_LABEL,
  LOAN_INSTALLMENT_PAID_LABEL,
  LOAN_INSTALLMENT_UNALLOCATED_LABEL,
  type LoanInstallmentHistoryLoanInput,
  type LoanInstallmentSlipAggregateInput,
} from "../loan-installment-history"

/**
 * AC-LH-B1/B2 (F-2026-10-25-019-S): histori tahap 1 agregat jujur.
 * Falsifikasi kunci: baris agregat TIDAK punya field nominal per pinjaman —
 * mengalokasikan loanDeduction slip ke pinjaman ini harus MERAH di tes ini.
 */

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function loan(overrides: Partial<LoanInstallmentHistoryLoanInput> = {}): LoanInstallmentHistoryLoanInput {
  return {
    id: 11,
    employeeId: 7,
    employeeName: "Budi",
    loanDate: d("2026-01-15"),
    status: "active",
    totalAmount: 10_000_000,
    remainingAmount: 6_000_000,
    monthlyInstallment: 1_000_000,
    weeklyInstallment: null,
    ...overrides,
  }
}

function slip(overrides: Partial<LoanInstallmentSlipAggregateInput> = {}): LoanInstallmentSlipAggregateInput {
  return {
    payrollId: 101,
    documentNo: "PAY-2026-02",
    period: "2026-02",
    startDate: d("2026-02-01"),
    endDate: d("2026-02-28"),
    paymentDate: d("2026-03-01"),
    loanDeduction: 1_000_000,
    ...overrides,
  }
}

describe("buildLoanInstallmentHistory — AC-LH-B1 satu pinjaman, slip agregat jujur", () => {
  it("3 slip paid tampil agregat bertanda semua-pinjaman; terbayar kini = pokok − sisa (BR-LH-03/04)", () => {
    const h = buildLoanInstallmentHistory(loan(), [
      slip(),
      slip({ payrollId: 102, documentNo: "PAY-2026-03", period: "2026-03", paymentDate: d("2026-04-01") }),
      slip({ payrollId: 103, documentNo: "PAY-2026-04", period: "2026-04", paymentDate: d("2026-05-01") }),
    ])
    expect(h.loan.totalPaidToDate).toBe(4_000_000)
    expect(h.loan.paidLabel).toBe(LOAN_INSTALLMENT_PAID_LABEL)
    expect(h.aggregateSlipRows).toHaveLength(3)
    for (const row of h.aggregateSlipRows) {
      expect(row.kind).toBe("agregat-slip")
      expect(row.label).toBe(LOAN_INSTALLMENT_AGGREGATE_LABEL)
      expect(row.loanDeduction).toBe(1_000_000)
    }
    expect(h.ledgerRows).toEqual([])
    expect(h.ledgerVerifiedAmount).toBe(0)
  })

  it("FALSIFIKASI: baris agregat tidak membawa nominal per pinjaman (alokasi karangan mustahil dari payload)", () => {
    const h = buildLoanInstallmentHistory(loan(), [slip()])
    const row = h.aggregateSlipRows[0] as unknown as Record<string, unknown>
    expect(Object.keys(row).sort()).toEqual(
      ["documentNo", "endDate", "kind", "label", "loanDeduction", "paymentDate", "payrollId", "period", "startDate"].sort(),
    )
    expect(row).not.toHaveProperty("amount")
    expect(row).not.toHaveProperty("appliedAmount")
    expect(row).not.toHaveProperty("loanAmount")
  })

  it("ember tak-teralokasi tahap 1 = seluruh terbayar kini, wajib tampil (BR-LH-08)", () => {
    const h = buildLoanInstallmentHistory(loan(), [slip()])
    expect(h.unallocatedAmount).toBe(4_000_000)
    expect(h.hasUnallocated).toBe(true)
    expect(h.unallocatedLabel).toBe(LOAN_INSTALLMENT_UNALLOCATED_LABEL)
  })
})

describe("buildLoanInstallmentHistory — AC-LH-B2 dua pinjaman aktif bersamaan", () => {
  it("tidak ada baris per-pinjaman karangan; ember konsisten per pinjaman masing-masing (BR-LH-08)", () => {
    const slips = [slip({ loanDeduction: 2_000_000 })]
    const a = buildLoanInstallmentHistory(loan({ id: 11, remainingAmount: 6_000_000 }), slips)
    const b = buildLoanInstallmentHistory(
      loan({ id: 12, totalAmount: 5_000_000, remainingAmount: 3_000_000 }),
      slips,
    )
    // Slip yang sama tampil utuh sebagai agregat di kedua histori; tidak
    // dibelah 1jt/1jt atau jatah cicilan master masing-masing.
    expect(a.aggregateSlipRows[0].loanDeduction).toBe(2_000_000)
    expect(b.aggregateSlipRows[0].loanDeduction).toBe(2_000_000)
    expect(a.unallocatedAmount).toBe(4_000_000)
    expect(b.unallocatedAmount).toBe(2_000_000)
    expect(a.ledgerRows).toEqual([])
    expect(b.ledgerRows).toEqual([])
  })

  it("baris ledger terverifikasi mengurangi ember; slip berledger tidak dobel tampil agregat (BR-LH-08/10)", () => {
    const h = buildLoanInstallmentHistory(
      loan(),
      [slip(), slip({ payrollId: 102, documentNo: "PAY-2026-03", period: "2026-03" })],
      [{ payrollId: 102, documentNo: "PAY-2026-03", paymentDate: d("2026-04-01"), amount: 1_500_000 }],
    )
    expect(h.ledgerRows).toHaveLength(1)
    expect(h.ledgerRows[0]).toMatchObject({ kind: "ledger", amount: 1_500_000, label: LOAN_INSTALLMENT_LEDGER_LABEL })
    expect(h.ledgerVerifiedAmount).toBe(1_500_000)
    expect(h.aggregateSlipRows.map((r) => r.payrollId)).toEqual([101])
    expect(h.unallocatedAmount).toBe(2_500_000)
    expect(h.hasUnallocated).toBe(true)
  })

  it("ledger menutup seluruh terbayar → ember 0, hasUnallocated false", () => {
    const h = buildLoanInstallmentHistory(loan(), [], [
      { payrollId: 101, documentNo: "PAY-2026-02", paymentDate: d("2026-03-01"), amount: 4_000_000 },
    ])
    expect(h.unallocatedAmount).toBe(0)
    expect(h.hasUnallocated).toBe(false)
  })
})

describe("buildLoanInstallmentHistory — teks kosong permukaan (F-2026-10-26-053-S)", () => {
  it("AC-LH53-F4: tanpa slip paid → emptyLabel verbatim Q-LH53-2 dari payload, baris kosong, terbayar kini tetap ada", () => {
    const h = buildLoanInstallmentHistory(loan(), [])
    expect(h.emptyLabel).toBe("Belum ada cicilan terbayar tercatat.")
    expect(h.emptyLabel).toBe(LOAN_INSTALLMENT_HISTORY_EMPTY_LABEL)
    expect(h.aggregateSlipRows).toEqual([])
    expect(h.ledgerRows).toEqual([])
    expect(h.hasUnallocated).toBe(true)
    expect(h.loan.totalPaidToDate).toBe(4_000_000)
  })

  it("emptyLabel selalu kata final yang sama walau ada baris (UI menempel payload, bukan karang kata)", () => {
    const h = buildLoanInstallmentHistory(loan(), [slip()])
    expect(h.emptyLabel).toBe(LOAN_INSTALLMENT_HISTORY_EMPTY_LABEL)
    expect(h.aggregateSlipRows).toHaveLength(1)
  })
})

describe("buildLoanInstallmentHistory — tepi spec §8", () => {
  it("EC-6: slip loanDeduction 0 / negatif tanpa baris", () => {
    const h = buildLoanInstallmentHistory(loan(), [
      slip({ loanDeduction: 0 }),
      slip({ payrollId: 102, loanDeduction: -5 }),
    ])
    expect(h.aggregateSlipRows).toEqual([])
  })

  it("EC-1: pinjaman paid_off tetap terbaca historinya; tanpa perkiraan cicilan berikutnya", () => {
    const h = buildLoanInstallmentHistory(
      loan({ status: "paid_off", remainingAmount: 0 }),
      [slip()],
    )
    expect(h.loan.totalPaidToDate).toBe(10_000_000)
    expect(h.aggregateSlipRows).toHaveLength(1)
    expect(h.nextInstallment).toBeNull()
  })

  it("BR-LH-07/EC-5: WEEKLY tanpa weeklyInstallment tertulis → perkiraan null, tidak ditebak dari bulanan", () => {
    const h = buildLoanInstallmentHistory(loan(), [], [], "WEEKLY")
    expect(h.nextInstallment).toEqual({ frequency: "WEEKLY", amount: null, label: expect.any(String) })
  })

  it("WEEKLY dengan weeklyInstallment tertulis → perkiraan verbatim tersimpan", () => {
    const h = buildLoanInstallmentHistory(loan({ weeklyInstallment: 250_000 }), [], [], "WEEKLY")
    expect(h.nextInstallment?.amount).toBe(250_000)
  })

  it("MONTHLY aktif → perkiraan = monthlyInstallment tersimpan", () => {
    const h = buildLoanInstallmentHistory(loan(), [], [], "MONTHLY")
    expect(h.nextInstallment?.amount).toBe(1_000_000)
  })

  it("status di luar kosakata tertutup tampil apa adanya tertanda, bukan dipetakan (Q-LS-4)", () => {
    const h = buildLoanInstallmentHistory(loan({ status: "aneh" }), [])
    expect(h.loan.status).toBe("aneh")
    expect(h.loan.isUnknownStatus).toBe(true)
    expect(h.nextInstallment).toBeNull()
  })

  it("sisa negatif tidak di-clamp: terbayar kini apa adanya melebihi pokok", () => {
    const h = buildLoanInstallmentHistory(loan({ remainingAmount: -100 }), [])
    expect(h.loan.totalPaidToDate).toBe(10_000_100)
    expect(h.unallocatedAmount).toBe(10_000_100)
  })

  it("urut baris agregat: tanggal bayar, lalu awal periode, lalu id slip", () => {
    const h = buildLoanInstallmentHistory(loan(), [
      slip({ payrollId: 103, paymentDate: d("2026-05-01") }),
      slip({ payrollId: 101, paymentDate: d("2026-03-01") }),
      slip({ payrollId: 102, paymentDate: null, startDate: d("2026-06-01") }),
    ])
    expect(h.aggregateSlipRows.map((r) => r.payrollId)).toEqual([101, 103, 102])
  })
})
