// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { LoanInstallmentHistorySection } from "../loan-installment-history-section"
import {
  LOAN_INSTALLMENT_AGGREGATE_LABEL,
  LOAN_INSTALLMENT_HISTORY_EMPTY_LABEL,
  LOAN_INSTALLMENT_HISTORY_NOTICE,
  LOAN_INSTALLMENT_LEDGER_LABEL,
  LOAN_INSTALLMENT_NEXT_LABEL,
  LOAN_INSTALLMENT_PAID_LABEL,
  LOAN_INSTALLMENT_UNALLOCATED_LABEL,
  type LoanInstallmentHistory,
} from "@/lib/reports/loan-installment-history"
import {
  renderCard,
  unmountCard,
  clearRenderedCards,
} from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

function baseHistory(overrides: Partial<LoanInstallmentHistory> = {}): LoanInstallmentHistory {
  return {
    notice: LOAN_INSTALLMENT_HISTORY_NOTICE,
    emptyLabel: LOAN_INSTALLMENT_HISTORY_EMPTY_LABEL,
    loan: {
      id: 11,
      employeeId: 7,
      employeeName: "Budi Santoso",
      loanDate: new Date("2026-01-05T00:00:00"),
      status: "active",
      isUnknownStatus: false,
      totalAmount: 10_000_000,
      remainingAmount: 6_500_000,
      totalPaidToDate: 3_500_000,
      paidLabel: LOAN_INSTALLMENT_PAID_LABEL,
    },
    ledgerRows: [],
    ledgerVerifiedAmount: 0,
    aggregateSlipRows: [
      {
        kind: "agregat-slip",
        payrollId: 101,
        documentNo: "SLIP-2026-001",
        period: "2026-01",
        startDate: new Date("2026-01-01T00:00:00"),
        endDate: new Date("2026-01-31T00:00:00"),
        paymentDate: new Date("2026-01-31T00:00:00"),
        loanDeduction: 300_000,
        label: LOAN_INSTALLMENT_AGGREGATE_LABEL,
      },
    ],
    unallocatedAmount: 3_500_000,
    hasUnallocated: true,
    unallocatedLabel: LOAN_INSTALLMENT_UNALLOCATED_LABEL,
    nextInstallment: { frequency: "MONTHLY", amount: 500_000, label: LOAN_INSTALLMENT_NEXT_LABEL },
    ...overrides,
  }
}

describe("LoanInstallmentHistorySection", () => {
  it("menempel notice + label + angka verbatim payload (AC-LH-F1)", () => {
    const { container, root } = renderCard(<LoanInstallmentHistorySection history={baseHistory()} />)
    const text = container.textContent ?? ""
    expect(text).toContain(LOAN_INSTALLMENT_HISTORY_NOTICE)
    expect(text).toContain(LOAN_INSTALLMENT_PAID_LABEL)
    expect(text).toContain("Rp 3.500.000")
    expect(text).toContain(LOAN_INSTALLMENT_AGGREGATE_LABEL)
    expect(text).toContain("SLIP-2026-001")
    expect(text).toContain("Rp 300.000")
    expect(text).toContain(LOAN_INSTALLMENT_UNALLOCATED_LABEL)
    expect(container.querySelector('[aria-label="Histori cicilan pinjaman"]')).not.toBeNull()
    unmountCard(root)
  })

  it("ember tampil hanya bila hasUnallocated; kosong jujur tanpa slip", () => {
    const { container, root } = renderCard(
      <LoanInstallmentHistorySection
        history={baseHistory({ aggregateSlipRows: [], unallocatedAmount: 0, hasUnallocated: false })}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).not.toContain(LOAN_INSTALLMENT_UNALLOCATED_LABEL)
    expect(text).toContain(LOAN_INSTALLMENT_HISTORY_EMPTY_LABEL)
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })

  it("AC-LH53-F4: tampil mengikuti nilai emptyLabel payload, bukan literal komponen", () => {
    const custom = "Label kosong khusus payload uji."
    const { container, root } = renderCard(
      <LoanInstallmentHistorySection
        history={baseHistory({
          aggregateSlipRows: [],
          unallocatedAmount: 0,
          hasUnallocated: false,
          emptyLabel: custom,
        })}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain(custom)
    expect(text).not.toContain(LOAN_INSTALLMENT_HISTORY_EMPTY_LABEL)
    unmountCard(root)
  })

  it("baris ledger tampil dengan label Cicilan bila payload menyediakannya", () => {
    const { container, root } = renderCard(
      <LoanInstallmentHistorySection
        history={baseHistory({
          ledgerRows: [
            {
              kind: "ledger",
              payrollId: 202,
              documentNo: "SLIP-2026-002",
              paymentDate: new Date("2026-02-28T00:00:00"),
              amount: 500_000,
              label: LOAN_INSTALLMENT_LEDGER_LABEL,
            },
          ],
          ledgerVerifiedAmount: 500_000,
          aggregateSlipRows: [],
        })}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain(LOAN_INSTALLMENT_LEDGER_LABEL)
    expect(text).toContain("SLIP-2026-002")
    expect(text).toContain("Rp 500.000")
    unmountCard(root)
  })

  it("cicilan berikutnya null tampil label tanpa jadwal; tanpa nextInstallment seksi tetap utuh", () => {
    const { container, root } = renderCard(
      <LoanInstallmentHistorySection
        history={baseHistory({
          nextInstallment: { frequency: "WEEKLY", amount: null, label: LOAN_INSTALLMENT_NEXT_LABEL },
        })}
      />,
    )
    expect(container.textContent ?? "").toContain("Tanpa jadwal mingguan")
    unmountCard(root)

    const second = renderCard(
      <LoanInstallmentHistorySection history={baseHistory({ nextInstallment: null })} />,
    )
    expect(second.container.textContent ?? "").not.toContain(LOAN_INSTALLMENT_NEXT_LABEL)
    unmountCard(second.root)
  })

  it("status tak dikenal tertanda verbatim tanpa pemetaan karangan", () => {
    const { container, root } = renderCard(
      <LoanInstallmentHistorySection
        history={baseHistory({
          loan: { ...baseHistory().loan, status: "frozen", isUnknownStatus: true },
          nextInstallment: null,
        })}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("frozen")
    expect(text).toContain("Status tidak dikenal")
    unmountCard(root)
  })
})
