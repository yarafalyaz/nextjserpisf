/**
 * Laporan penggajian: **Gaji Karyawan**, **PPh 21 Karyawan**, dan **Porsi Gaji**.
 *
 * Rumus yang dipakai persis rumus modul penggajian (`generateBulkPayroll`,
 * `processPayroll`, update slip):
 *
 *   bruto = pokok + tunjangan + lembur + apresiasi
 *   potongan = potongan manual + pinjaman + keterlambatan + absen + BPJS karyawan + PPh 21
 *   bersih = max(0, bruto − potongan)
 *
 * Dua hal yang sengaja dijaga:
 *
 * - **Gaji bersih dibatasi 0** di modul, jadi laporan tidak boleh memaksa
 *   `bruto − potongan = bersih`; bila ada slip yang terpotong batas itu, laporan
 *   menyebutnya alih-alih menyembunyikan selisihnya.
 * - **Slip berstatus draft tidak dihitung** (belum final). Jumlahnya dilaporkan
 *   sebagai peringatan supaya "laporan kosong" tidak disalahartikan sebagai
 *   "tidak ada gaji".
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm). */
const EMPLOYEE_COLUMNS: TableColumn[] = [
  { header: "Karyawan", align: "left", width: 52 },
  { header: "Slip", align: "right", width: 18 },
  { header: "Gaji Pokok", align: "right", width: 32 },
  { header: "Tunjangan", align: "right", width: 30 },
  { header: "Lembur", align: "right", width: 28 },
  { header: "Potongan", align: "right", width: 32 },
  { header: "Bruto", align: "right", width: 34 },
  { header: "Bersih", align: "right", width: 34 },
]

const PPH_COLUMNS: TableColumn[] = [
  { header: "Karyawan", align: "left", width: 56 },
  { header: "NPWP", align: "left", width: 44 },
  { header: "Slip", align: "right", width: 18 },
  { header: "Bruto", align: "right", width: 44 },
  { header: "PPh 21", align: "right", width: 40 },
  { header: "Bersih", align: "right", width: 44 },
]

const COMPOSITION_COLUMNS: TableColumn[] = [
  { header: "Komponen", align: "left", width: 110 },
  { header: "Jumlah", align: "right", width: 70 },
  { header: "Porsi", align: "right", width: 40 },
]

export interface PayrollRowInput {
  employeeName: string
  npwp: string | null
  baseSalary: number
  allowances: number
  appreciation: number
  overtime: number
  /** Potongan non-statutori: manual + pinjaman + keterlambatan + absen. */
  deductions: number
  bpjsHealth: number
  bpjsEmployment: number
  pph21: number
  gross: number
  net: number
}

export interface PayrollTotals {
  slips: number
  baseSalary: number
  allowances: number
  overtime: number
  deductions: number
  bpjs: number
  pph21: number
  gross: number
  net: number
  /** Slip yang gaji bersihnya kena batas 0 (potongan melebihi bruto). */
  flooredNet: number
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function emptyTotals(): PayrollTotals {
  return {
    slips: 0,
    baseSalary: 0,
    allowances: 0,
    overtime: 0,
    deductions: 0,
    bpjs: 0,
    pph21: 0,
    gross: 0,
    net: 0,
    flooredNet: 0,
  }
}

function accumulate(totals: PayrollTotals, row: PayrollRowInput): void {
  totals.slips += 1
  totals.baseSalary = safeAdd(totals.baseSalary, row.baseSalary, 2)
  totals.allowances = safeAdd(totals.allowances, safeAdd(row.allowances, row.appreciation, 2), 2)
  totals.overtime = safeAdd(totals.overtime, row.overtime, 2)
  totals.deductions = safeAdd(totals.deductions, row.deductions, 2)
  totals.bpjs = safeAdd(totals.bpjs, safeAdd(row.bpjsHealth, row.bpjsEmployment, 2), 2)
  totals.pph21 = safeAdd(totals.pph21, row.pph21, 2)
  totals.gross = safeAdd(totals.gross, row.gross, 2)
  totals.net = safeAdd(totals.net, row.net, 2)
  // Rumus modul: bersih = max(0, bruto − potongan total).
  const expected = safeSubtract(row.gross, safeAdd(safeAdd(row.deductions, row.bpjsHealth, 2), safeAdd(row.bpjsEmployment, row.pph21, 2), 2), 2)
  if (expected < 0) totals.flooredNet += 1
}

interface Grouped {
  employeeName: string
  npwp: string | null
  rows: PayrollRowInput[]
}

function groupByEmployee(rows: PayrollRowInput[]): Grouped[] {
  const map = new Map<string, Grouped>()
  for (const row of rows) {
    const key = row.employeeName
    const existing = map.get(key)
    if (existing) existing.rows.push(row)
    else map.set(key, { employeeName: row.employeeName, npwp: row.npwp, rows: [row] })
  }
  return [...map.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName, "id-ID"))
}

/** Dua slip berurutan untuk periode yang sama pada satu karyawan = data ganda. */
export function duplicateEmployeePeriods(rows: { employeeName: string; period: string }[]): string[] {
  const seen = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.employeeName}|${row.period}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key.split("|")[0])
}

export interface PayrollReportResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: PayrollTotals
  verdict: string
}

export function buildPayrollByEmployee(input: {
  rows: PayrollRowInput[]
  draftSlips: number
  duplicateEmployees: string[]
}): PayrollReportResult {
  const groups = groupByEmployee(input.rows)
  const totals = emptyTotals()
  for (const row of input.rows) accumulate(totals, row)

  const rows: TableRow[] = groups.map((group) => {
    const sub = emptyTotals()
    for (const row of group.rows) accumulate(sub, row)
    return {
      kind: "data",
      cells: [
        group.employeeName,
        String(group.rows.length),
        amount(sub.baseSalary),
        amount(sub.allowances),
        amount(sub.overtime),
        amount(sub.deductions),
        amount(sub.gross),
        amount(sub.net),
      ],
    }
  })

  if (groups.length === 0) {
    rows.push({
      kind: "notice",
      text:
        "Tidak ada slip gaji yang sudah disetujui/dibayar pada periode ini. " +
        "Slip berstatus draft belum dihitung.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [
        String(totals.slips),
        amount(totals.baseSalary),
        amount(totals.allowances),
        amount(totals.overtime),
        amount(totals.deductions),
        amount(totals.gross),
        amount(totals.net),
      ],
    })
  }

  if (input.draftSlips > 0) {
    rows.push({
      kind: "notice",
      text: `${input.draftSlips} slip gaji masih berstatus draft dan belum dihitung di laporan ini.`,
    })
  }
  if (totals.flooredNet > 0) {
    rows.push({
      kind: "notice",
      text:
        `${totals.flooredNet} slip punya potongan melebihi bruto, jadi gaji bersihnya dibatasi 0 ` +
        "(sama seperti modul penggajian). Karena itu bruto − potongan bisa lebih kecil dari bersih.",
    })
  }
  if (input.duplicateEmployees.length > 0) {
    rows.push({
      kind: "notice",
      text:
        `Ada lebih dari satu slip untuk karyawan dan periode yang sama: ${[...new Set(input.duplicateEmployees)].join(", ")}. ` +
        "Periksa apakah memang ada dua periode berbeda di rentang ini.",
    })
  }

  const verdict =
    groups.length === 0
      ? "Tidak ada slip gaji disetujui pada periode ini"
      : `${totals.slips} slip · bruto ${formatCurrency(totals.gross)} · bersih ${formatCurrency(totals.net)}` +
        (input.draftSlips > 0 ? ` · ${input.draftSlips} draft belum dihitung` : "")

  return { table: { columns: EMPLOYEE_COLUMNS, rows }, totals, verdict }
}

export function buildPph21(input: { rows: PayrollRowInput[]; draftSlips: number }): PayrollReportResult {
  const groups = groupByEmployee(input.rows)
  const totals = emptyTotals()
  for (const row of input.rows) accumulate(totals, row)

  const rows: TableRow[] = groups.map((group) => {
    const sub = emptyTotals()
    for (const row of group.rows) accumulate(sub, row)
    return {
      kind: "data",
      cells: [
        group.employeeName,
        group.npwp ?? "—",
        String(group.rows.length),
        amount(sub.gross),
        amount(sub.pph21),
        amount(sub.net),
      ],
    }
  })

  if (groups.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada PPh 21 pada periode ini (belum ada slip disetujui)." })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [String(totals.slips), "", amount(totals.gross), amount(totals.pph21), amount(totals.net)],
    })
  }

  if (totals.pph21 === 0 && groups.length > 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada PPh 21 yang dipotong pada periode ini — bisa berarti penghasilan karyawan di bawah PTKP.",
    })
  }
  if (input.draftSlips > 0) {
    rows.push({ kind: "notice", text: `${input.draftSlips} slip masih draft dan belum dihitung.` })
  }
  rows.push({
    kind: "notice",
    text: "PPh 21 adalah yang dipotong dari karyawan pada slip gaji, bukan kewajiban pajak perusahaan secara keseluruhan.",
  })

  const verdict =
    groups.length === 0
      ? "Tidak ada PPh 21 pada periode ini"
      : `PPh 21 dipotong ${formatCurrency(totals.pph21)} dari bruto ${formatCurrency(totals.gross)} (${totals.slips} slip)`

  return { table: { columns: PPH_COLUMNS, rows }, totals, verdict }
}

export function buildPayrollComposition(input: { rows: PayrollRowInput[]; draftSlips: number }): PayrollReportResult {
  const totals = emptyTotals()
  for (const row of input.rows) accumulate(totals, row)

  const earning = (label: string, value: number): TableRow => ({
    kind: "data",
    cells: [label, amount(value), percent(value, totals.gross)],
  })
  const deduction = (label: string, value: number): TableRow => ({
    kind: "data",
    cells: [label, amount(-value), percent(value, totals.gross)],
  })

  const rows: TableRow[] = []

  if (totals.slips === 0) {
    rows.push({ kind: "notice", text: "Tidak ada slip gaji disetujui pada periode ini." })
  } else {
    rows.push({ kind: "group", label: "Penerimaan" })
    rows.push(earning("Gaji Pokok", totals.baseSalary))
    rows.push(earning("Tunjangan & Apresiasi", totals.allowances))
    rows.push(earning("Lembur", totals.overtime))
    rows.push({ kind: "total", label: "Bruto", cells: [amount(totals.gross), percent(totals.gross, totals.gross)] })

    rows.push({ kind: "group", label: "Potongan" })
    rows.push(deduction("Potongan (manual, pinjaman, keterlambatan, absen)", totals.deductions))
    rows.push(deduction("BPJS Karyawan", totals.bpjs))
    rows.push(deduction("PPh 21", totals.pph21))
    rows.push({
      kind: "total",
      label: "Total Potongan",
      cells: [amount(-(safeAdd(safeAdd(totals.deductions, totals.bpjs, 2), totals.pph21, 2))), percent(safeAdd(safeAdd(totals.deductions, totals.bpjs, 2), totals.pph21, 2), totals.gross)],
    })

    rows.push({
      kind: "total",
      grand: true,
      label: "Gaji Bersih",
      cells: [amount(totals.net), percent(totals.net, totals.gross)],
    })
  }

  if (input.draftSlips > 0) {
    rows.push({ kind: "notice", text: `${input.draftSlips} slip masih draft dan belum masuk komposisi ini.` })
  }
  rows.push({
    kind: "notice",
    text: "Porsi dihitung terhadap bruto. Angka potongan ditampilkan negatif; persennya terhadap bruto (bukan terhadap potongan).",
  })

  const verdict =
    totals.slips === 0
      ? "Tidak ada slip gaji disetujui pada periode ini"
      : `Bruto ${formatCurrency(totals.gross)} · potongan ${formatCurrency(safeAdd(safeAdd(totals.deductions, totals.bpjs, 2), totals.pph21, 2))} · bersih ${formatCurrency(totals.net)}`

  return { table: { columns: COMPOSITION_COLUMNS, rows }, totals, verdict }
}

function percent(value: number, base: number): string {
  if (base === 0) return "n/a"
  return `${((value / base) * 100).toFixed(1).replace(".", ",")}%`
}

export function payrollByEmployeeSummary(result: PayrollReportResult): string {
  if (result.totals.slips === 0) return "Tidak ada slip gaji disetujui pada periode ini"
  return (
    `${result.totals.slips} slip · pokok ${formatCurrency(result.totals.baseSalary)} · ` +
    `tunjangan ${formatCurrency(result.totals.allowances)} · lembur ${formatCurrency(result.totals.overtime)} · ` +
    `potongan ${formatCurrency(result.totals.deductions)} · bruto ${formatCurrency(result.totals.gross)} · ` +
    `bersih ${formatCurrency(result.totals.net)}`
  )
}

export function pph21Summary(result: PayrollReportResult): string {
  if (result.totals.slips === 0) return "Tidak ada PPh 21 pada periode ini"
  return (
    `PPh 21 ${formatCurrency(result.totals.pph21)} · bruto ${formatCurrency(result.totals.gross)} · ` +
    `bersih ${formatCurrency(result.totals.net)} (${result.totals.slips} slip)`
  )
}

export function payrollCompositionSummary(result: PayrollReportResult): string {
  if (result.totals.slips === 0) return "Tidak ada slip gaji disetujui pada periode ini"
  return (
    `Bruto ${formatCurrency(result.totals.gross)} · BPJS ${formatCurrency(result.totals.bpjs)} · ` +
    `PPh 21 ${formatCurrency(result.totals.pph21)} · bersih ${formatCurrency(result.totals.net)}`
  )
}
