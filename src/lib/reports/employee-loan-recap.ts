/**
 * Rekap sisa pinjaman aktif per karyawan (F-2026-10-25-046-S, BR-LR46-01..10).
 *
 * Builder murni (tanpa Prisma/DOM/izin): menerima baris EmployeeLoan polos
 * yang SUDAH tersaring scope oleh loader (`employee-loan-recap-data.ts`),
 * mengelompokkan per karyawan atas populasi aktif/pending (putusan Lead
 * Q-LR46-2). Kosakata status tertutup dipakai ulang dari
 * `employee-loan-channel.ts` (Q-LS-4): pending → active | rejected;
 * active → paid_off.
 *
 * Aturan uang (dibekukan spec, jangan tebak ulang):
 * - Σ aktif HANYA dari baris berstatus persis `active` (BR-LR46-02/03):
 *   Σ pokok = Σ totalAmount, Σ sisa = Σ remainingAmount, Σ terbayar
 *   turunan = Σ pokok − Σ sisa atas populasi aktif yang sama. Baris
 *   `paid_off`/`rejected` TIDAK pernah masuk Σ aktif.
 * - `pending` hanya ember hitungan "menunggu persetujuan" — bukan sisa
 *   kewajiban (BR-LR46-02, EC-4).
 * - Status di luar kosakata tertutup terhitung apa adanya di ember tak
 *   dikenal (`unknownStatuses`), tidak masuk Σ aktif, tidak dipetakan
 *   paksa (BR-LR46-02, AC-LR46-B4).
 * - Cicilan verbatim tersimpan, dua frekuensi TERPISAH (BR-LR46-04):
 *   Σ monthlyInstallment pinjaman aktif dan Σ weeklyInstallment non-null
 *   pinjaman aktif. Baris aktif ber-weeklyInstallment NULL terhitung di
 *   ember tanpa jadwal mingguan dan TIDAK pernah dikonversi dari
 *   monthlyInstallment (vonis F-2026-10-23-105-V).
 * - Sisa negatif tampil apa adanya tertanda anomali, TIDAK di-clamp
 *   ke 0 (EC-8). Pinjaman aktif bersisa 0 tetap populasi aktif —
 *   builder tidak menebak lunas (EC-1).
 * - Karyawan nonaktif (isActive=false ATAU employmentEndedAt terisi)
 *   yang masih punya pinjaman aktif tetap tampil tertanda fakta itu;
 *   sisa TIDAK dinolkan (BR-LR46-07, vonis 023-V butir 2E).
 * - Kanal pengajuan (mandiri/titipan) TIDAK diagregasikan per karyawan
 *   (BR-LR46-10); builder tidak menulis EmployeeLoan apa pun (BR-LR46-09).
 *
 * Keluaran TANPA baseSalary/komponen gaji/nominal slip/loanDeduction
 * (BR-LR46-06) dan TANPA proyeksi potongan/lunas (BR-LR46-05).
 * Urutan baris: Σ sisa aktif terbesar dulu, seri nama lalu employeeId
 * (BR-LR46-08). Total scope = Σ atas baris tampil, bukan rata-rata.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { isEmployeeLoanStatus } from "@/lib/reports/employee-loan-channel"

/** Label verbatim untuk UI (AC-LR46-F1 — UI menempel apa adanya). */
export const EMPLOYEE_LOAN_RECAP_NOTICE =
  "Rekap sisa pinjaman berjalan — menampilkan fakta pinjaman tersimpan; " +
  "bukan proyeksi potongan slip berikutnya dan bukan perkiraan tanggal lunas."
export const EMPLOYEE_LOAN_RECAP_PENDING_LABEL = "Menunggu persetujuan"
export const EMPLOYEE_LOAN_RECAP_NO_WEEKLY_LABEL = "Tanpa jadwal mingguan"
export const EMPLOYEE_LOAN_RECAP_NO_DEPARTMENT_LABEL = "Tanpa departemen"
export const EMPLOYEE_LOAN_RECAP_INACTIVE_LABEL =
  "Karyawan nonaktif — sisa pinjaman tetap tertagih terpisah"
export const EMPLOYEE_LOAN_RECAP_NEGATIVE_LABEL =
  "Sisa negatif — anomali data, tindak lanjuti HR"
export const EMPLOYEE_LOAN_RECAP_UNKNOWN_STATUS_LABEL = "Status tidak dikenal"

export interface EmployeeLoanRecapRowInput {
  employeeId: number
  employeeName: string | null
  departmentId: number | null
  departmentName: string | null
  /** Fakta master karyawan (BR-LR46-07); builder tidak menebak dari tanggal lain. */
  isActive: boolean
  employmentEndedAt: Date | null
  loanDate: Date
  status: string
  totalAmount: number
  monthlyInstallment: number
  /** NULL = tanpa jadwal mingguan (BR-LR46-04); dilarang dikonversi. */
  weeklyInstallment: number | null
  remainingAmount: number
}

export interface EmployeeLoanRecapEmployee {
  employeeId: number
  employeeName: string | null
  departmentId: number | null
  departmentName: string | null
  /** Jumlah pinjaman berstatus persis `active`. */
  activeCount: number
  /** Σ totalAmount pinjaman aktif (BR-LR46-03). */
  totalPrincipalActive: number
  /** Σ remainingAmount pinjaman aktif apa adanya — negatif tidak di-clamp (EC-8). */
  totalRemainingActive: number
  /** Σ pokok aktif − Σ sisa aktif atas populasi aktif yang sama (BR-LR46-03). */
  totalPaidDerived: number
  /** Σ monthlyInstallment pinjaman aktif, verbatim tersimpan (BR-LR46-04). */
  monthlyInstallmentTotal: number
  /** Σ weeklyInstallment non-null pinjaman aktif, terpisah dari bulanan (BR-LR46-04). */
  weeklyInstallmentTotal: number
  /** Pinjaman aktif ber-weeklyInstallment NULL (ember jujur, bukan konversi). */
  activeWithoutWeeklyCount: number
  /** loanDate pinjaman aktif tertua; null bila tidak ada pinjaman aktif. */
  oldestActiveLoanDate: Date | null
  /** Ember menunggu persetujuan — hitungan saja, bukan sisa kewajiban (BR-LR46-02). */
  pendingCount: number
  /** Status di luar kosakata tertutup, apa adanya (BR-LR46-02). */
  unknownStatusCount: number
  unknownStatuses: string[]
  /** Karyawan nonaktif yang masih punya pinjaman aktif (BR-LR46-07). */
  isInactiveWithActiveLoans: boolean
  /** Ada pinjaman aktif bersisa negatif (EC-8) — tampil apa adanya, tidak di-clamp. */
  hasNegativeRemaining: boolean
  negativeRemainingCount: number
}

export interface EmployeeLoanRecap {
  notice: string
  employees: EmployeeLoanRecapEmployee[]
  totals: {
    employeeCount: number
    activeCount: number
    totalPrincipalActive: number
    totalRemainingActive: number
    totalPaidDerived: number
    monthlyInstallmentTotal: number
    weeklyInstallmentTotal: number
    activeWithoutWeeklyCount: number
    pendingCount: number
    unknownStatusCount: number
    inactiveWithActiveLoansCount: number
    negativeRemainingCount: number
  }
}

interface EmployeeAcc {
  employeeName: string | null
  departmentId: number | null
  departmentName: string | null
  isActive: boolean
  employmentEndedAt: Date | null
  activeCount: number
  totalPrincipalActive: number
  totalRemainingActive: number
  monthlyInstallmentTotal: number
  weeklyInstallmentTotal: number
  activeWithoutWeeklyCount: number
  oldestActiveLoanDate: Date | null
  pendingCount: number
  unknownStatusCount: number
  unknownStatuses: Set<string>
  negativeRemainingCount: number
}

function emptyEmployeeAcc(row: EmployeeLoanRecapRowInput): EmployeeAcc {
  return {
    employeeName: row.employeeName,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    isActive: row.isActive,
    employmentEndedAt: row.employmentEndedAt,
    activeCount: 0,
    totalPrincipalActive: 0,
    totalRemainingActive: 0,
    monthlyInstallmentTotal: 0,
    weeklyInstallmentTotal: 0,
    activeWithoutWeeklyCount: 0,
    oldestActiveLoanDate: null,
    pendingCount: 0,
    unknownStatusCount: 0,
    unknownStatuses: new Set<string>(),
    negativeRemainingCount: 0,
  }
}

export function buildEmployeeLoanRecap(
  rows: readonly EmployeeLoanRecapRowInput[],
): EmployeeLoanRecap {
  const perEmployee = new Map<number, EmployeeAcc>()

  for (const row of rows) {
    // BR-LR46-02: rejected/paid_off tidak pernah membentuk baris rekap —
    // riwayat lunas/ditolak wilayah daftar transaksional, bukan sisa berjalan.
    if (row.status === "rejected" || row.status === "paid_off") continue

    const acc = perEmployee.get(row.employeeId) ?? emptyEmployeeAcc(row)
    if (acc.employeeName === null && row.employeeName !== null) {
      acc.employeeName = row.employeeName
    }
    if (acc.departmentName === null && row.departmentName !== null) {
      acc.departmentName = row.departmentName
      acc.departmentId = row.departmentId
    }

    if (row.status === "active") {
      acc.activeCount += 1
      acc.totalPrincipalActive = safeAdd(acc.totalPrincipalActive, row.totalAmount, 2)
      // EC-8: sisa negatif dijumlah apa adanya, tidak di-clamp ke 0.
      acc.totalRemainingActive = safeAdd(acc.totalRemainingActive, row.remainingAmount, 2)
      acc.monthlyInstallmentTotal = safeAdd(
        acc.monthlyInstallmentTotal,
        row.monthlyInstallment,
        2,
      )
      if (row.weeklyInstallment === null) {
        // BR-LR46-04: ember tanpa jadwal mingguan — TIDAK dikonversi
        // dari monthlyInstallment dengan pembagi apa pun.
        acc.activeWithoutWeeklyCount += 1
      } else {
        acc.weeklyInstallmentTotal = safeAdd(
          acc.weeklyInstallmentTotal,
          row.weeklyInstallment,
          2,
        )
      }
      if (row.remainingAmount < 0) acc.negativeRemainingCount += 1
      if (
        acc.oldestActiveLoanDate === null ||
        row.loanDate < acc.oldestActiveLoanDate
      ) {
        acc.oldestActiveLoanDate = row.loanDate
      }
    } else if (row.status === "pending") {
      // Ember menunggu persetujuan: hitungan saja, nol kontribusi Σ (EC-4).
      acc.pendingCount += 1
    } else if (!isEmployeeLoanStatus(row.status)) {
      // Status tak dikenal: terhitung apa adanya, tidak dipetakan paksa.
      acc.unknownStatusCount += 1
      acc.unknownStatuses.add(row.status)
    }
    perEmployee.set(row.employeeId, acc)
  }

  const employees: EmployeeLoanRecapEmployee[] = [...perEmployee.entries()].map(
    ([employeeId, acc]) => ({
      employeeId,
      employeeName: acc.employeeName,
      departmentId: acc.departmentId,
      departmentName: acc.departmentName,
      activeCount: acc.activeCount,
      totalPrincipalActive: acc.totalPrincipalActive,
      totalRemainingActive: acc.totalRemainingActive,
      totalPaidDerived: safeSubtract(
        acc.totalPrincipalActive,
        acc.totalRemainingActive,
        2,
      ),
      monthlyInstallmentTotal: acc.monthlyInstallmentTotal,
      weeklyInstallmentTotal: acc.weeklyInstallmentTotal,
      activeWithoutWeeklyCount: acc.activeWithoutWeeklyCount,
      oldestActiveLoanDate: acc.oldestActiveLoanDate,
      pendingCount: acc.pendingCount,
      unknownStatusCount: acc.unknownStatusCount,
      unknownStatuses: [...acc.unknownStatuses].sort((a, b) =>
        a.localeCompare(b),
      ),
      isInactiveWithActiveLoans:
        acc.activeCount > 0 && (!acc.isActive || acc.employmentEndedAt !== null),
      hasNegativeRemaining: acc.negativeRemainingCount > 0,
      negativeRemainingCount: acc.negativeRemainingCount,
    }),
  )

  // BR-LR46-08: Σ sisa aktif terbesar dulu; seri nama karyawan lalu employeeId.
  employees.sort((a, b) => {
    if (b.totalRemainingActive !== a.totalRemainingActive) {
      return b.totalRemainingActive - a.totalRemainingActive
    }
    const nameCmp = (a.employeeName ?? "").localeCompare(b.employeeName ?? "")
    return nameCmp !== 0 ? nameCmp : a.employeeId - b.employeeId
  })

  const totals = {
    employeeCount: employees.length,
    activeCount: 0,
    totalPrincipalActive: 0,
    totalRemainingActive: 0,
    totalPaidDerived: 0,
    monthlyInstallmentTotal: 0,
    weeklyInstallmentTotal: 0,
    activeWithoutWeeklyCount: 0,
    pendingCount: 0,
    unknownStatusCount: 0,
    inactiveWithActiveLoansCount: 0,
    negativeRemainingCount: 0,
  }
  for (const emp of employees) {
    totals.activeCount += emp.activeCount
    totals.totalPrincipalActive = safeAdd(
      totals.totalPrincipalActive,
      emp.totalPrincipalActive,
      2,
    )
    totals.totalRemainingActive = safeAdd(
      totals.totalRemainingActive,
      emp.totalRemainingActive,
      2,
    )
    totals.totalPaidDerived = safeAdd(
      totals.totalPaidDerived,
      emp.totalPaidDerived,
      2,
    )
    totals.monthlyInstallmentTotal = safeAdd(
      totals.monthlyInstallmentTotal,
      emp.monthlyInstallmentTotal,
      2,
    )
    totals.weeklyInstallmentTotal = safeAdd(
      totals.weeklyInstallmentTotal,
      emp.weeklyInstallmentTotal,
      2,
    )
    totals.activeWithoutWeeklyCount += emp.activeWithoutWeeklyCount
    totals.pendingCount += emp.pendingCount
    totals.unknownStatusCount += emp.unknownStatusCount
    if (emp.isInactiveWithActiveLoans) totals.inactiveWithActiveLoansCount += 1
    totals.negativeRemainingCount += emp.negativeRemainingCount
  }

  return { notice: EMPLOYEE_LOAN_RECAP_NOTICE, employees, totals }
}
