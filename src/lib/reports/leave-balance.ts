/**
 * Laporan saldo cuti tahunan per karyawan (F-2026-10-25-013-S, BR-LVB-01..14).
 *
 * Builder murni (tanpa Prisma/DOM): menerima baris saldo polos yang SUDAH
 * dihitung `getLeaveQuota` oleh loader (`leave-balance-data.ts`) — builder
 * DILARANG menghitung ulang hari kerja/eligibility (anchor kelayakan milik
 * service, BR-LVB-10). Tugas builder hanya: saring departemen (irisan yang
 * sudah dipersempit loader oleh scope — menyaring tidak pernah memperluas),
 * total ringkasan, dan serialisasi CSV pola `statement-csv.ts`.
 *
 * Invariant BR-LVB-03/12: per baris `usedApproved + usedPending = used`;
 * pemisahan pending hanya lapis tampil, penjaga kuota tidak berubah.
 * Total hanya menjumlah karyawan `eligible` (EC-1: belum 1 tahun tidak
 * masuk total jatah), meniru kartu ringkasan halaman existing.
 * Keluaran tanpa nominal gaji apa pun (BR-LVB-07).
 */

export const LEAVE_BALANCE_NOT_ELIGIBLE_LABEL = "Belum 1 tahun"
export const LEAVE_BALANCE_INACTIVE_LABEL = "Nonaktif"
export const LEAVE_BALANCE_NO_DEPARTMENT_LABEL = "−"

export interface LeaveBalanceRowInput {
  employeeId: number
  name: string
  employeeNo: string
  departmentId: number | null
  department: string | null
  /** Tanggal bergabung ISO (YYYY-MM-DD), apa adanya dari loader. */
  joinDate: string
  /** false = berhenti/nonaktif; baris tetap tampil tertanda (BR-LVB-13). */
  isActive: boolean
  entitled: number
  used: number
  usedApproved: number
  usedPending: number
  remaining: number
  eligible: boolean
  tenureMonths: number
}

export interface LeaveBalanceReport {
  year: number
  rows: LeaveBalanceRowInput[]
  totals: {
    employeeCount: number
    eligibleCount: number
    notEligibleCount: number
    inactiveCount: number
    totalEntitled: number
    totalUsed: number
    totalUsedApproved: number
    totalUsedPending: number
    totalRemaining: number
  }
}

export interface LeaveBalanceFilters {
  /** Saring satu departemen; null/undefined = semua dalam scope loader. */
  departmentId?: number | null
}

/**
 * Bangun laporan dari baris loader. Filter departemen di sini adalah
 * penyempitan tampilan terakhir; keamanan scope ditegakkan loader lewat
 * `hrEmployeeScopeWhere` (AC-LVB-B1) — baris di luar scope tidak pernah
 * sampai ke builder.
 */
export function buildLeaveBalanceReport(
  year: number,
  input: LeaveBalanceRowInput[],
  filters: LeaveBalanceFilters = {},
): LeaveBalanceReport {
  const rows =
    filters.departmentId != null
      ? input.filter((r) => r.departmentId === filters.departmentId)
      : [...input]

  const eligible = rows.filter((r) => r.eligible)
  const sum = (pick: (r: LeaveBalanceRowInput) => number) =>
    eligible.reduce((s, r) => s + pick(r), 0)

  return {
    year,
    rows,
    totals: {
      employeeCount: rows.length,
      eligibleCount: eligible.length,
      notEligibleCount: rows.length - eligible.length,
      inactiveCount: rows.filter((r) => !r.isActive).length,
      totalEntitled: sum((r) => r.entitled),
      totalUsed: sum((r) => r.used),
      totalUsedApproved: sum((r) => r.usedApproved),
      totalUsedPending: sum((r) => r.usedPending),
      totalRemaining: sum((r) => r.remaining),
    },
  }
}

function csvCell(value: string): string {
  // Anti formula-injection spreadsheet, pola statement-csv.ts.
  const safeValue = /^[=+\-@\t|%]/.test(value) ? `\t${value}` : value
  return `"${safeValue.replace(/"/g, '""')}"`
}

/**
 * CSV laporan (BR-LVB-11): kolom sama persis dengan tabel — karyawan,
 * departemen, status aktif, masa kerja, jatah, terpakai disetujui,
 * terpakai menunggu, sisa. Nama berkas memuat tahun laporan.
 */
export function buildLeaveBalanceCsv(report: LeaveBalanceReport): {
  csv: string
  fileName: string
} {
  const header = [
    "Karyawan",
    "No. Karyawan",
    "Departemen",
    "Status",
    "Masa Kerja (bulan)",
    "Jatah (hari)",
    "Terpakai Disetujui (hari)",
    "Terpakai Menunggu (hari)",
    "Sisa (hari)",
  ]
  const lines = report.rows.map((r) => [
    r.name,
    r.employeeNo,
    r.department ?? LEAVE_BALANCE_NO_DEPARTMENT_LABEL,
    r.isActive ? "Aktif" : LEAVE_BALANCE_INACTIVE_LABEL,
    r.eligible ? String(r.tenureMonths) : LEAVE_BALANCE_NOT_ELIGIBLE_LABEL,
    String(r.entitled),
    String(r.usedApproved),
    String(r.usedPending),
    String(r.remaining),
  ])
  const csv = `﻿${[header, ...lines].map((row) => row.map(csvCell).join(",")).join("\n")}\n`
  return { csv, fileName: `saldo-cuti-${report.year}.csv` }
}
