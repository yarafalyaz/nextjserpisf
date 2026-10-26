/**
 * Histori cicilan per pinjaman karyawan — tahap 1 BACA-SAJA
 * (F-2026-10-25-019-S, BR-LH-01..10, AC-LH-B1/B2/B4/B5).
 *
 * Builder murni (tanpa Prisma/DOM/izin): menerima SATU pinjaman polos +
 * baris slip `paid` karyawan yang sama yang SUDAH tersaring scope oleh
 * loader (`employee-loan-history-data.ts`). Ledger fisik per pinjaman
 * BELUM ada (tahap 2 LH-B2 di luar kartu ini) — karena itu:
 *
 * - Total terbayar kini = totalAmount − remainingAmount, fakta kini
 *   (BR-LH-03); TIDAK pernah hasil menjumlahkan alokasi karangan.
 * - Tiap slip `paid` ber-loanDeduction > 0 tampil sebagai baris agregat
 *   bertanda semua-pinjaman (`agregat-slip`, BR-LH-04): nominal slip
 *   TIDAK dialokasikan ke pinjaman ini, tidak dibagi rata, dan payload
 *   TIDAK memuat field alokasi per pinjaman apa pun (AC-LH-B1/B2).
 * - Ember `tak-teralokasi` = terbayar kini − Σ ledger terverifikasi
 *   (BR-LH-08). Tahap 1 jumlah ledger selalu 0 → ember = seluruh
 *   terbayar kini bila > 0; wajib tampil, tidak disembunyikan.
 *   Baris ledger hanya muncul bila loader tahap 2 menyediakannya
 *   (bentuk disiapkan, fisiknya bukan kartu ini) — builder tidak
 *   pernah mengarang baris ledger dari cicilan master (BR-LH-10).
 * - Slip belum `paid` TIDAK masuk histori terbayar (AC-LH-B5):
 *   loader hanya memilih status `paid`; builder juga membuang status
 *   lain secara defensif. Slip ber-loanDeduction 0 tanpa baris (EC-6).
 * - Sisa sesudah cicilan TIDAK ditampilkan tahap 1 (hanya sah dari
 *   ledger berurutan, spec §3) — payload tidak memuatnya.
 * - Perkiraan cicilan berikutnya = cicilan master tersimpan per
 *   frekuensi (BR-LH-07): dua frekuensi terpisah, mingguan NULL tetap
 *   null (tanpa jadwal mingguan), TIDAK dikonversi dari bulanan.
 * - Keluaran TANPA nominal gaji/slip selain loanDeduction agregat itu
 *   sendiri (BR-LH-09); tanpa agregat lintas karyawan.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"

export const EMPLOYEE_LOAN_HISTORY_NOTICE =
  "Histori cicilan tahap awal — potongan slip lampau tersimpan sebagai " +
  "agregat semua pinjaman; alokasi per pinjaman tidak dikarang."
export const EMPLOYEE_LOAN_HISTORY_AGGREGATE_LABEL =
  "Potongan gaji periode ini (semua pinjaman)"
export const EMPLOYEE_LOAN_HISTORY_ALLOCATED_LABEL = "Cicilan"
export const EMPLOYEE_LOAN_HISTORY_UNALLOCATED_LABEL =
  "Terbayar belum teralokasi per pinjaman"
export const EMPLOYEE_LOAN_HISTORY_TOTAL_PAID_LABEL = "Terbayar s.d. kini"
export const EMPLOYEE_LOAN_HISTORY_NEXT_MONTHLY_LABEL = "Perkiraan cicilan bulanan berikutnya"
export const EMPLOYEE_LOAN_HISTORY_NEXT_WEEKLY_LABEL = "Perkiraan cicilan mingguan berikutnya"
export const EMPLOYEE_LOAN_HISTORY_NO_WEEKLY_LABEL = "Tanpa jadwal mingguan"

export interface EmployeeLoanHistoryLoanInput {
  loanId: number
  loanDate: Date
  status: string
  totalAmount: number
  monthlyInstallment: number
  /** NULL = tanpa jadwal mingguan tertulis (BR-LH-07); dilarang dikonversi. */
  weeklyInstallment: number | null
  remainingAmount: number
}

/** Baris slip karyawan yang sama; loader hanya mengirim status `paid`. */
export interface EmployeeLoanHistoryPayrollInput {
  payrollId: number
  documentNo: string
  period: string
  status: string
  paymentDate: Date | null
  /** Agregat potongan pinjaman slip itu (semua pinjaman karyawan). */
  loanDeduction: number
}

/**
 * Baris ledger terverifikasi per pinjaman (tahap 2 LH-B2). Tahap 1
 * loader TIDAK pernah mengisinya — disediakan agar ember BR-LH-08
 * punya pengurang sah begitu ledger fisik ada.
 */
export interface EmployeeLoanHistoryLedgerInput {
  payrollId: number
  documentNo: string
  paymentDate: Date | null
  amount: number
}

export type EmployeeLoanHistoryEntry =
  | {
      kind: "agregat-slip"
      payrollId: number
      documentNo: string
      period: string
      paymentDate: Date | null
      /** Nominal agregat slip (semua pinjaman) — BUKAN alokasi pinjaman ini. */
      aggregateDeduction: number
      label: string
    }
  | {
      kind: "ledger"
      payrollId: number
      documentNo: string
      paymentDate: Date | null
      allocatedAmount: number
      label: string
    }

export interface EmployeeLoanHistory {
  notice: string
  loanId: number
  status: string
  totalAmount: number
  remainingAmount: number
  /** BR-LH-03: totalAmount − remainingAmount atas fakta kini. */
  totalPaidDerived: number
  totalPaidLabel: string
  /** Baris terbayar terverifikasi: agregat-slip (tahap 1) lalu ledger (tahap 2). */
  entries: EmployeeLoanHistoryEntry[]
  /** Σ baris ledger terverifikasi; tahap 1 selalu 0. */
  verifiedAllocatedTotal: number
  /** BR-LH-08: terbayar kini − ledger terverifikasi; tampil bila > 0 (juga diekspos 0). */
  unallocatedAmount: number
  unallocatedLabel: string
  /** Perkiraan dari cicilan master tersimpan — bukan janji (spec §3, BR-LH-07). */
  nextMonthlyInstallment: number
  nextMonthlyLabel: string
  nextWeeklyInstallment: number | null
  nextWeeklyLabel: string
  noWeeklyLabel: string
}

export function buildEmployeeLoanHistory(input: {
  loan: EmployeeLoanHistoryLoanInput
  payrolls: readonly EmployeeLoanHistoryPayrollInput[]
  ledger?: readonly EmployeeLoanHistoryLedgerInput[]
}): EmployeeLoanHistory {
  const { loan } = input

  const entries: EmployeeLoanHistoryEntry[] = []
  for (const p of input.payrolls) {
    // AC-LH-B5 + EC-6: hanya slip paid berpotongan > 0 yang terbayar.
    if (p.status !== "paid") continue
    if (!(p.loanDeduction > 0)) continue
    entries.push({
      kind: "agregat-slip",
      payrollId: p.payrollId,
      documentNo: p.documentNo,
      period: p.period,
      paymentDate: p.paymentDate,
      aggregateDeduction: p.loanDeduction,
      label: EMPLOYEE_LOAN_HISTORY_AGGREGATE_LABEL,
    })
  }

  let verifiedAllocatedTotal = 0
  for (const l of input.ledger ?? []) {
    verifiedAllocatedTotal = safeAdd(verifiedAllocatedTotal, l.amount, 2)
    entries.push({
      kind: "ledger",
      payrollId: l.payrollId,
      documentNo: l.documentNo,
      paymentDate: l.paymentDate,
      allocatedAmount: l.amount,
      label: EMPLOYEE_LOAN_HISTORY_ALLOCATED_LABEL,
    })
  }

  // Kronologis pembayaran: tanggal bayar (fallback awal periode tidak
  // ditebak — null terakhir), seri nomor dokumen lalu id slip.
  entries.sort((a, b) => {
    const ta = a.paymentDate?.getTime() ?? Number.POSITIVE_INFINITY
    const tb = b.paymentDate?.getTime() ?? Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    const doc = a.documentNo.localeCompare(b.documentNo)
    return doc !== 0 ? doc : a.payrollId - b.payrollId
  })

  const totalPaidDerived = safeSubtract(loan.totalAmount, loan.remainingAmount, 2)

  return {
    notice: EMPLOYEE_LOAN_HISTORY_NOTICE,
    loanId: loan.loanId,
    status: loan.status,
    totalAmount: loan.totalAmount,
    remainingAmount: loan.remainingAmount,
    totalPaidDerived,
    totalPaidLabel: EMPLOYEE_LOAN_HISTORY_TOTAL_PAID_LABEL,
    entries,
    verifiedAllocatedTotal,
    // BR-LH-08: ember eksplisit; tidak di-clamp — anomali negatif
    // tampil apa adanya sama seperti sisa negatif pada rekap 046-S.
    unallocatedAmount: safeSubtract(totalPaidDerived, verifiedAllocatedTotal, 2),
    unallocatedLabel: EMPLOYEE_LOAN_HISTORY_UNALLOCATED_LABEL,
    nextMonthlyInstallment: loan.monthlyInstallment,
    nextMonthlyLabel: EMPLOYEE_LOAN_HISTORY_NEXT_MONTHLY_LABEL,
    nextWeeklyInstallment: loan.weeklyInstallment,
    nextWeeklyLabel: EMPLOYEE_LOAN_HISTORY_NEXT_WEEKLY_LABEL,
    noWeeklyLabel: EMPLOYEE_LOAN_HISTORY_NO_WEEKLY_LABEL,
  }
}
