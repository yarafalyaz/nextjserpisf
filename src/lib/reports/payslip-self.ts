/**
 * Builder murni slip gaji mandiri karyawan (F-2026-10-25-009-S).
 *
 * Permukaan baca-saja "Slip Gaji Saya": hanya rekod Payroll final
 * (BR-PS-01, himpunan FINAL_PAYROLL_STATUSES existing di
 * `src/actions/hrm.actions.ts`) milik karyawan yang login persis
 * (BR-PS-02), fail-closed tanpa Employee tertaut (BR-PS-03).
 *
 * Angka diteruskan apa adanya dari rekod Payroll — TIDAK ada hitung
 * ulang gaji/pajak/BPJS di sini (BR-PS-04, AC-PS-5). Potongan pinjaman
 * hanya angka `loanDeduction` rekod, tanpa rincian pinjaman (BR-PS-06).
 * Label status = STATUS_LABELS server verbatim; UI menempel apa adanya.
 *
 * Lapisan pertahanan kedua: walau pemanggil mengirim baris di luar
 * himpunan final / milik orang lain, builder membuangnya — permukaan
 * ini tidak pernah menampilkan draft/cancelled atau slip karyawan lain
 * (AC-PS-1/AC-PS-2). Filter server di loader tetap penjaga utama.
 */

import { STATUS_LABELS } from "@/lib/utils/status-labels"

/** Himpunan status final slip — sama persis FINAL_PAYROLL_STATUSES existing. */
export const OWN_PAYSLIP_FINAL_STATUSES = ["approved", "paid"] as const

export type OwnPayslipStatus = (typeof OWN_PAYSLIP_FINAL_STATUSES)[number]

export interface OwnPayslipRowInput {
  id: number
  slug: string | null
  documentNo: string
  employeeId: number | null
  period: string
  startDate: Date
  endDate: Date
  status: string
  paymentDate: Date | null
  baseSalary: number
  allowances: number
  deductions: number
  overtimeTotal: number
  appreciationTotal: number
  loanDeduction: number
  lateDeduction: number
  absentDeduction: number
  grossSalary: number
  bpjsHealthEmployee: number
  bpjsEmploymentEmployee: number
  pph21: number
  netSalary: number
  workingDays: number
  presentDays: number
  absentDays: number
  lateMinutes: number
}

export interface OwnPayslipComponentLineInput {
  componentNameSnapshot: string
  kindSnapshot: string
  amount: number
}

/** Baris daftar slip sendiri. `netSalary` tampil atas izin BR-PS-05. */
export interface OwnPayslipListRow {
  id: number
  slug: string | null
  documentNo: string
  period: string
  status: OwnPayslipStatus
  /** Label status verbatim server (STATUS_LABELS); UI dilarang mengarang. */
  statusLabel: string
  /** Null bila status approved belum dibayar (EC-3) — tanpa tanggal karangan. */
  paymentDate: Date | null
  netSalary: number
}

export interface OwnPayslipDetail extends OwnPayslipListRow {
  employeeId: number
  startDate: Date
  endDate: Date
  baseSalary: number
  allowances: number
  deductions: number
  overtimeTotal: number
  appreciationTotal: number
  loanDeduction: number
  lateDeduction: number
  absentDeduction: number
  grossSalary: number
  bpjsHealthEmployee: number
  bpjsEmploymentEmployee: number
  pph21: number
  workingDays: number
  presentDays: number
  absentDays: number
  lateMinutes: number
  componentLines: OwnPayslipComponentLineInput[]
}

function isFinalStatus(status: string): status is OwnPayslipStatus {
  return (OWN_PAYSLIP_FINAL_STATUSES as readonly string[]).includes(status)
}

function toListRow(row: OwnPayslipRowInput, status: OwnPayslipStatus): OwnPayslipListRow {
  return {
    id: row.id,
    slug: row.slug,
    documentNo: row.documentNo,
    period: row.period,
    status,
    statusLabel: STATUS_LABELS[status] ?? status,
    paymentDate: row.paymentDate,
    netSalary: row.netSalary,
  }
}

/**
 * Daftar slip final milik `selfEmployeeId` persis, periode terbaru dulu
 * (periode "YYYY-MM" terurut leksikografis = kronologis; seri dipecah
 * id terbesar dulu — EC-1: semua rekod final tampil apa adanya, tidak
 * ada yang dipilih sebagai "yang benar"). `selfEmployeeId <= 0`
 * (fail-closed getHrScope, mis. -1) selalu menghasilkan daftar kosong.
 */
export function buildOwnPayslipList(
  selfEmployeeId: number,
  rows: OwnPayslipRowInput[],
): OwnPayslipListRow[] {
  if (!Number.isSafeInteger(selfEmployeeId) || selfEmployeeId <= 0) return []
  return rows
    .filter(
      (r): r is OwnPayslipRowInput & { status: OwnPayslipStatus } =>
        r.employeeId === selfEmployeeId && isFinalStatus(r.status),
    )
    .sort((a, b) =>
      a.period === b.period ? b.id - a.id : a.period < b.period ? 1 : -1,
    )
    .map((r) => toListRow(r, r.status))
}

/**
 * Detail satu slip: null (404 di permukaan) bila rekod tidak ada,
 * bukan milik `selfEmployeeId` persis, atau status bukan final —
 * termasuk slip draft milik sendiri (AC-PS-2).
 */
export function buildOwnPayslipDetail(
  selfEmployeeId: number,
  row: (OwnPayslipRowInput & { componentLines: OwnPayslipComponentLineInput[] }) | null,
): OwnPayslipDetail | null {
  if (!row) return null
  if (!Number.isSafeInteger(selfEmployeeId) || selfEmployeeId <= 0) return null
  if (row.employeeId !== selfEmployeeId || !isFinalStatus(row.status)) return null
  const status: OwnPayslipStatus = row.status
  return {
    ...toListRow(row, status),
    employeeId: row.employeeId,
    startDate: row.startDate,
    endDate: row.endDate,
    baseSalary: row.baseSalary,
    allowances: row.allowances,
    deductions: row.deductions,
    overtimeTotal: row.overtimeTotal,
    appreciationTotal: row.appreciationTotal,
    loanDeduction: row.loanDeduction,
    lateDeduction: row.lateDeduction,
    absentDeduction: row.absentDeduction,
    grossSalary: row.grossSalary,
    bpjsHealthEmployee: row.bpjsHealthEmployee,
    bpjsEmploymentEmployee: row.bpjsEmploymentEmployee,
    pph21: row.pph21,
    workingDays: row.workingDays,
    presentDays: row.presentDays,
    absentDays: row.absentDays,
    lateMinutes: row.lateMinutes,
    componentLines: row.componentLines.map((l) => ({
      componentNameSnapshot: l.componentNameSnapshot,
      kindSnapshot: l.kindSnapshot,
      amount: l.amount,
    })),
  }
}
