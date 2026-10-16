/**
 * Penyusun tabel laporan Rasio Keuangan (dipakai halaman & engine PDF).
 *
 * Satu tempat supaya layar dan cetakan tidak bisa berbeda: label, format nilai,
 * dan kolom rumusnya sama.
 */

import { formatRatio, type FinancialRatiosResult } from "@/lib/finance/financial-ratios"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 266mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Rasio", align: "left", width: 110 },
  { header: "Nilai", align: "right", width: 40 },
  { header: "Rumus", align: "left", width: 116 },
]

export function buildRatiosTable(result: FinancialRatiosResult): {
  columns: TableColumn[]
  rows: TableRow[]
} {
  const rows: TableRow[] = []

  for (const group of result.groups) {
    rows.push({ kind: "group", label: group.label })
    for (const row of group.rows) {
      rows.push({ kind: "data", cells: [row.label, formatRatio(row), row.formula] })
    }
  }

  const unavailable = result.rows.filter((row) => row.value === null)
  if (unavailable.length > 0) {
    rows.push({
      kind: "notice",
      text:
        `${unavailable.length} rasio tidak dapat dihitung karena penyebutnya nol ` +
        `(${unavailable.map((row) => row.label).join(", ")}). Nilainya ditampilkan "n/a", bukan 0, ` +
        "supaya tidak terbaca seolah hasilnya baik.",
    })
  }

  return { columns: COLUMNS, rows }
}
