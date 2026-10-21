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
  type Pph21RecapSlipInput,
} from "@/lib/reports/pph21-recap"
import {
  buildPph21Export,
  type Pph21ExportResult,
} from "@/lib/reports/pph21-export"
import { formatAccounting } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export type { Pph21Recap, Pph21RecapEmployeeRow, Pph21RecapPeriodRow }
export { buildPph21Recap }
export type { Pph21ExportResult }

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

/** Satu-satunya query payroll jalur rekap+ekspor (F-028-I §I.2, AC-9). */
async function fetchPph21Slips(period: { start: Date; end: Date }): Promise<Pph21RecapSlipInput[]> {
  const payrolls = await prisma.payroll.findMany({
    where: { startDate: { gte: period.start, lte: period.end } },
    select: {
      employeeId: true, period: true, status: true, type: true,
      grossSalary: true, pph21: true, netSalary: true, statutorySnapshot: true,
      paymentDate: true, endDate: true,
      employee: {
        select: {
          name: true, npwp: true, idNumber: true,
          maritalStatus: true, dependents: true,
          position: { select: { name: true } },
        },
      },
    },
    orderBy: [{ period: "asc" }, { id: "asc" }],
  })
  return payrolls.map((p) => ({
    employeeId: p.employeeId,
    employeeName: p.employee?.name ?? "Tanpa karyawan",
    npwp: p.employee?.npwp ?? null,
    period: p.period,
    status: p.status,
    grossSalary: Number(p.grossSalary),
    pph21: Number(p.pph21),
    netSalary: Number(p.netSalary),
    statutorySnapshot: p.statutorySnapshot ?? null,
    nik: p.employee?.idNumber ?? null,
    maritalStatus: p.employee?.maritalStatus ?? null,
    dependents: p.employee?.dependents ?? null,
    position: p.employee?.position?.name ?? null,
    type: p.type,
    paymentDate: p.paymentDate ?? null,
    endDate: p.endDate ?? null,
  }))
}

export async function loadPph21Recap(
  period: { start: Date; end: Date },
  opts?: { annualYear?: number },
): Promise<Pph21RecapReport> {
  const recap = buildPph21Recap(await fetchPph21Slips(period))

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

/**
 * Ekspor internal CSV Lapis 1 (F-028-I): jalur data SAMA dengan
 * `loadPph21Recap` (satu query `fetchPph21Slips`, builder sama) — bukan
 * query agregasi kedua. Hasil membawa bukti rekonsiliasi terstruktur;
 * pemanggil (UI/unduhan BOT 2) wajib mengarsipkannya bersama berkas.
 * Tanpa tabel/log baru: bukti hidup di hasil ini (§I.6, tanpa migrasi).
 */
export async function loadPph21Export(
  period: { start: Date; end: Date },
  targetPeriods: readonly string[],
  opts?: { correctionNo?: number; exportedBy?: string | null },
): Promise<Pph21ExportResult> {
  const recap = buildPph21Recap(await fetchPph21Slips(period))
  return buildPph21Export(recap, targetPeriods, opts)
}
