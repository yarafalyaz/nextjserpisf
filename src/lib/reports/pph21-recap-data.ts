/**
 * F-2026-10-21-028 loader — rekap PPh21 masa + tahunan.
 *
 * Read-model murni: tanpa migrasi/jurnal/mutasi/ekspor DJP. Satu query
 * payroll semua status & tahun: builder `buildPph21Recap` menyaring
 * approved/paid sendiri (agar falsifikasi filter teruji di builder),
 * loader hanya map Decimal → number + identitas karyawan.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import {
  buildPph21Recap,
  type Pph21Recap,
  type Pph21RecapEmployeeRow,
  type Pph21RecapPeriodRow,
} from "@/lib/reports/pph21-recap"
import { formatAccounting } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export type { Pph21Recap, Pph21RecapEmployeeRow, Pph21RecapPeriodRow }
export { buildPph21Recap }

export interface Pph21RecapReport {
  recap: Pph21Recap
  periodTable: { columns: TableColumn[]; rows: TableRow[] }
  /** Tabel tahunan untuk `year` terpilih (tahun berjalan bila tak diminta). */
  annualYear: number
  annualTable: { columns: TableColumn[]; rows: TableRow[] }
  periodLabel: string
  periodCaption: string
}

const PERIOD_COLUMNS: TableColumn[] = [
  { header: "Masa", align: "left", width: 26 },
  { header: "Karyawan", align: "right", width: 24 },
  { header: "Slip", align: "right", width: 16 },
  { header: "Bruto", align: "right", width: 40 },
  { header: "PPh21 Terpotong", align: "right", width: 40 },
  { header: "Bersih", align: "right", width: 40 },
]

const ANNUAL_COLUMNS: TableColumn[] = [
  { header: "Karyawan", align: "left", width: 52 },
  { header: "NPWP", align: "left", width: 44 },
  { header: "Masa", align: "right", width: 16 },
  { header: "Bruto", align: "right", width: 40 },
  { header: "PPh21 Terpotong", align: "right", width: 40 },
  { header: "Bersih", align: "right", width: 40 },
]

const money = (v: number) => formatAccounting(v, { zeroDash: false })

function periodTable(recap: Pph21Recap): { columns: TableColumn[]; rows: TableRow[] } {
  const rows: TableRow[] = recap.periods.map((p) => ({
    kind: "data",
    cells: [p.period, String(p.employees), String(p.slips), money(p.gross), money(p.pph21), money(p.net)],
  }))
  if (recap.periods.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada slip gaji disetujui/dibayar pada rentang ini." })
  } else {
    rows.push({
      kind: "total", grand: true, label: "Jumlah",
      cells: [String(recap.totals.employees), String(recap.totals.slips), money(recap.totals.gross), money(recap.totals.pph21), money(recap.totals.net)],
    })
  }
  if (recap.excludedSlips > 0) rows.push({ kind: "notice", text: `${recap.excludedSlips} slip belum disetujui/dibayar (draft/dll) tidak dihitung.` })
  if (recap.unreadablePeriodSlips > 0) rows.push({ kind: "notice", text: `${recap.unreadablePeriodSlips} slip disetujui periode-nya tidak terbaca dan tidak dihitung.` })
  rows.push({ kind: "notice", text: "Rekap baca dari slip terbit — bukan berkas ekspor DJP/e-Bupot." })
  return { columns: PERIOD_COLUMNS, rows }
}

function annualTable(recap: Pph21Recap, year: number): { columns: TableColumn[]; rows: TableRow[] } {
  const emps = recap.employeesByYear.get(year) ?? []
  const rows: TableRow[] = emps.map((e) => ({
    kind: "data",
    cells: [e.employeeName, e.npwp ?? "—", String(e.periods), money(e.gross), money(e.pph21), money(e.net)],
  }))
  if (emps.length === 0) {
    rows.push({ kind: "notice", text: `Tidak ada slip gaji disetujui/dibayar tahun ${year}.` })
    return { columns: ANNUAL_COLUMNS, rows }
  }
  rows.push({
    kind: "total", grand: true, label: "Jumlah",
    cells: [
      String(emps.length), "",
      money(emps.reduce((s, e) => s + e.gross, 0)),
      money(emps.reduce((s, e) => s + e.pph21, 0)),
      money(emps.reduce((s, e) => s + e.net, 0)),
    ],
  })
  const over = emps.reduce((s, e) => s + e.overWithheld, 0)
  if (over > 0) rows.push({ kind: "notice", text: `Lebih potong masa final wajib kembali ke karyawan: ${money(over)}.` })
  return { columns: ANNUAL_COLUMNS, rows }
}

export async function loadPph21Recap(
  period: { start: Date; end: Date },
  opts?: { annualYear?: number },
): Promise<Pph21RecapReport> {
  const payrolls = await prisma.payroll.findMany({
    where: { startDate: { gte: period.start, lte: period.end } },
    select: {
      employeeId: true, period: true, status: true,
      grossSalary: true, pph21: true, netSalary: true, statutorySnapshot: true,
      employee: { select: { name: true, npwp: true } },
    },
    orderBy: [{ period: "asc" }, { id: "asc" }],
  })

  const recap = buildPph21Recap(payrolls.map((p) => ({
    employeeId: p.employeeId,
    employeeName: p.employee?.name ?? "Tanpa karyawan",
    npwp: p.employee?.npwp ?? null,
    period: p.period,
    status: p.status,
    grossSalary: Number(p.grossSalary),
    pph21: Number(p.pph21),
    netSalary: Number(p.netSalary),
    statutorySnapshot: p.statutorySnapshot ?? null,
  })))

  const years = [...recap.employeesByYear.keys()]
  const annualYear = opts?.annualYear ?? (years.length ? Math.max(...years) : period.end.getFullYear())

  return {
    recap,
    periodTable: periodTable(recap),
    annualYear,
    annualTable: annualTable(recap, annualYear),
    ...rangePeriodLabels(period),
  }
}
