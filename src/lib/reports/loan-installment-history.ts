/**
 * Histori cicilan per pinjaman karyawan — TAHAP 1, BACA-SAJA
 * (F-2026-10-25-019-S, BR-LH-01..10; spec PR #825 merged 16c6c9eb).
 *
 * Builder murni (tanpa Prisma/DOM/izin): menerima SATU pinjaman yang SUDAH
 * tersaring scope oleh loader (`loan-installment-history-data.ts`), slip
 * `paid` karyawan pemilik pinjaman itu, dan baris ledger terverifikasi
 * (tahap 1 selalu kosong — model ledger fisik = LH-B2 tahap 2, belum ada).
 *
 * Aturan jujur yang dibekukan spec (jangan tebak ulang):
 * - BR-LH-03: total terbayar kini = `totalAmount - remainingAmount` atas
 *   field tersimpan pinjaman ini. BUKAN penjumlahan alokasi slip.
 * - BR-LH-04: slip pra-ledger hanya tampil sebagai agregat per slip
 *   bertanda semua-pinjaman. Nominal slip TIDAK PERNAH dialokasikan ke
 *   pinjaman ini — payload sengaja tidak punya field nominal per-pinjaman
 *   untuk baris agregat (falsifikasi AC-LH-B1/B2 mengunci himpunan kunci).
 * - BR-LH-08: ember tak-teralokasi = terbayar kini − ledger terverifikasi;
 *   > 0 wajib tampil apa adanya, tidak disembunyikan, tidak dibagi rata.
 *   Tahap 1 ledger kosong → ember = seluruh terbayar kini.
 * - BR-LH-10: backfill ledger lampau DILARANG; baris `ledger` hanya dari
 *   `ledgerRows` yang diberikan pemanggil (sumber persis tahap 2).
 *   Slip yang sudah punya baris ledger tidak tampil lagi sebagai agregat
 *   (satu potongan, satu baris — sumber persis menggantikan agregat).
 * - EC-6: slip ber-`loanDeduction` <= 0 tanpa baris. Slip belum `paid`
 *   disaring loader (AC-LH-B5); builder juga menolak nominal <= 0.
 * - Perkiraan cicilan berikutnya memakai `loanInstallmentForFrequency`
 *   existing atas frekuensi slip karyawan (BR-LH-07): WEEKLY tanpa
 *   `weeklyInstallment` tertulis = null, tidak ditebak dari bulanan.
 *   Pinjaman non-`active` tidak punya perkiraan cicilan berikutnya.
 *
 * Keluaran TANPA nominal gaji apa pun dan TANPA data pinjaman/karyawan
 * lain (BR-LH-09): builder hanya melihat pinjaman yang diberikan.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { isEmployeeLoanStatus } from "@/lib/reports/employee-loan-channel"
import { loanInstallmentForFrequency } from "@/lib/reports/payroll-weekly"
import type { PayrollFrequency } from "@/lib/reports/payroll-frequency"

/** Label verbatim untuk UI (spec §3 — UI menempel apa adanya). */
export const LOAN_INSTALLMENT_HISTORY_NOTICE =
  "Histori cicilan baca-saja — potongan lampau tampil sebagai agregat per slip " +
  "(semua pinjaman) karena alokasi per pinjaman belum tercatat; bukan alokasi pinjaman ini."
export const LOAN_INSTALLMENT_PAID_LABEL = "Terbayar s.d. kini"
export const LOAN_INSTALLMENT_AGGREGATE_LABEL =
  "Potongan gaji periode ini (semua pinjaman)"
export const LOAN_INSTALLMENT_LEDGER_LABEL = "Cicilan"
export const LOAN_INSTALLMENT_UNALLOCATED_LABEL =
  "Terbayar belum teralokasi per pinjaman (pra-ledger)"
export const LOAN_INSTALLMENT_NEXT_LABEL = "Perkiraan cicilan berikutnya"
export const LOAN_INSTALLMENT_UNKNOWN_STATUS_LABEL = "Status tidak dikenal"
/**
 * Teks kosong verbatim BR-LH53-05(a) spec F-2026-10-26-053-S, kata final
 * putusan Lead Q-LH53-2 (t_1f5489bd, PR #938 komentar 6401860137):
 * "Belum ada cicilan terbayar tercatat." — kata datang dari server lewat
 * payload `emptyLabel`, UI dilarang mengarang/menukar kata sendiri
 * (AC-LH53-F1: ganti kata di payload wajib mengubah tampil).
 */
export const LOAN_INSTALLMENT_HISTORY_EMPTY_LABEL =
  "Belum ada cicilan terbayar tercatat."

export interface LoanInstallmentHistoryLoanInput {
  id: number
  employeeId: number
  employeeName: string | null
  loanDate: Date
  /** Kosakata tertutup Q-LS-4; di luar itu tampil apa adanya tertanda. */
  status: string
  totalAmount: number
  remainingAmount: number
  monthlyInstallment: number
  /** NULL = tanpa jadwal mingguan tertulis (BR-LH-07); dilarang dikonversi. */
  weeklyInstallment: number | null
}

export interface LoanInstallmentSlipAggregateInput {
  payrollId: number
  documentNo: string
  period: string
  startDate: Date
  endDate: Date
  paymentDate: Date | null
  /** Agregat potongan pinjaman slip ini untuk SEMUA pinjaman karyawan. */
  loanDeduction: number
}

export interface LoanInstallmentLedgerRowInput {
  payrollId: number
  documentNo: string
  paymentDate: Date | null
  /** Nominal persis yang diterapkan ke pinjaman ini oleh slip itu (tahap 2). */
  amount: number
}

export interface LoanInstallmentAggregateRow {
  kind: "agregat-slip"
  payrollId: number
  documentNo: string
  period: string
  startDate: Date
  endDate: Date
  paymentDate: Date | null
  /** Nominal agregat slip (semua pinjaman) — BUKAN jatah pinjaman ini. */
  loanDeduction: number
  label: string
}

export interface LoanInstallmentLedgerRow {
  kind: "ledger"
  payrollId: number
  documentNo: string
  paymentDate: Date | null
  amount: number
  label: string
}

export interface LoanInstallmentHistory {
  notice: string
  /** Teks kosong BR-LH53-05(a): tampil verbatim UI bila tanpa baris. */
  emptyLabel: string
  loan: {
    id: number
    employeeId: number
    employeeName: string | null
    loanDate: Date
    status: string
    /** Status di luar kosakata tertutup Q-LS-4 — apa adanya, tak dipetakan. */
    isUnknownStatus: boolean
    totalAmount: number
    remainingAmount: number
    /** BR-LH-03: totalAmount − remainingAmount, apa adanya (tak di-clamp). */
    totalPaidToDate: number
    paidLabel: string
  }
  /** Baris persis tahap 2 (tahap 1 selalu kosong), urut tanggal bayar. */
  ledgerRows: LoanInstallmentLedgerRow[]
  /** Σ ledgerRows — satu-satunya "terverifikasi per pinjaman" yang sah. */
  ledgerVerifiedAmount: number
  /** Slip paid pra-ledger, agregat semua-pinjaman (BR-LH-04). */
  aggregateSlipRows: LoanInstallmentAggregateRow[]
  /** BR-LH-08: terbayar kini − ledger terverifikasi, apa adanya. */
  unallocatedAmount: number
  /** > 0 = ember wajib tampil; tidak pernah dibagi rata ke pinjaman lain. */
  hasUnallocated: boolean
  unallocatedLabel: string
  /**
   * Perkiraan cicilan berikutnya per frekuensi slip (BR-LH-07); null bila
   * pinjaman bukan `active` atau nominal frekuensi itu tidak tertulis.
   */
  nextInstallment: { frequency: PayrollFrequency; amount: number | null; label: string } | null
}

function byPaymentThenStart(
  a: { paymentDate: Date | null; startDate?: Date; payrollId: number },
  b: { paymentDate: Date | null; startDate?: Date; payrollId: number },
): number {
  const pa = a.paymentDate?.getTime() ?? Number.POSITIVE_INFINITY
  const pb = b.paymentDate?.getTime() ?? Number.POSITIVE_INFINITY
  if (pa !== pb) return pa - pb
  const sa = a.startDate?.getTime() ?? 0
  const sb = b.startDate?.getTime() ?? 0
  if (sa !== sb) return sa - sb
  return a.payrollId - b.payrollId
}

export function buildLoanInstallmentHistory(
  loan: LoanInstallmentHistoryLoanInput,
  slips: readonly LoanInstallmentSlipAggregateInput[],
  ledgerRows: readonly LoanInstallmentLedgerRowInput[] = [],
  slipFrequency: PayrollFrequency = "MONTHLY",
): LoanInstallmentHistory {
  const totalPaidToDate = safeSubtract(loan.totalAmount, loan.remainingAmount, 2)

  const ledger: LoanInstallmentLedgerRow[] = ledgerRows
    .map((r) => ({
      kind: "ledger" as const,
      payrollId: r.payrollId,
      documentNo: r.documentNo,
      paymentDate: r.paymentDate,
      amount: r.amount,
      label: LOAN_INSTALLMENT_LEDGER_LABEL,
    }))
    .sort(byPaymentThenStart)
  const ledgerVerifiedAmount = ledger.reduce(
    (sum, r) => safeAdd(sum, r.amount, 2),
    0,
  )
  const ledgerPayrollIds = new Set(ledger.map((r) => r.payrollId))

  const aggregateSlipRows: LoanInstallmentAggregateRow[] = slips
    .filter((s) => s.loanDeduction > 0 && !ledgerPayrollIds.has(s.payrollId))
    .map((s) => ({
      kind: "agregat-slip" as const,
      payrollId: s.payrollId,
      documentNo: s.documentNo,
      period: s.period,
      startDate: s.startDate,
      endDate: s.endDate,
      paymentDate: s.paymentDate,
      loanDeduction: s.loanDeduction,
      label: LOAN_INSTALLMENT_AGGREGATE_LABEL,
    }))
    .sort(byPaymentThenStart)

  const unallocatedAmount = safeSubtract(
    totalPaidToDate,
    ledgerVerifiedAmount,
    2,
  )

  const nextInstallment =
    loan.status === "active"
      ? {
          frequency: slipFrequency,
          amount: loanInstallmentForFrequency(
            {
              monthlyInstallment: loan.monthlyInstallment,
              weeklyInstallment: loan.weeklyInstallment,
            },
            slipFrequency,
          ),
          label: LOAN_INSTALLMENT_NEXT_LABEL,
        }
      : null

  return {
    notice: LOAN_INSTALLMENT_HISTORY_NOTICE,
    emptyLabel: LOAN_INSTALLMENT_HISTORY_EMPTY_LABEL,
    loan: {
      id: loan.id,
      employeeId: loan.employeeId,
      employeeName: loan.employeeName,
      loanDate: loan.loanDate,
      status: loan.status,
      isUnknownStatus: !isEmployeeLoanStatus(loan.status),
      totalAmount: loan.totalAmount,
      remainingAmount: loan.remainingAmount,
      totalPaidToDate,
      paidLabel: LOAN_INSTALLMENT_PAID_LABEL,
    },
    ledgerRows: ledger,
    ledgerVerifiedAmount,
    aggregateSlipRows,
    unallocatedAmount,
    hasUnallocated: unallocatedAmount > 0,
    unallocatedLabel: LOAN_INSTALLMENT_UNALLOCATED_LABEL,
    nextInstallment,
  }
}
