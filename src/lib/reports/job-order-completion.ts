/**
 * Penyelesaian pesanan per bulan — barang jadi yang keluar dari tiap pekerjaan
 * beserta biaya satuannya (`ProductionGenealogy`).
 *
 * Sumbernya sengaja genealogi, bukan `ProductionOrder.completedQty`: genealogi
 * menyimpan dokumen penyelesaian, serial/lot keluaran, operator, dan waktu
 * selesai, sehingga laporan ini bisa ditelusuri balik ke bahan yang dipakai.
 * `completedQty` tetap dipakai laporan biaya per pekerjaan, karena di sana yang
 * dibutuhkan hanya angkanya.
 *
 * Pekerjaan yang diselesaikan sebagian muncul sebagai beberapa baris (satu per
 * dokumen penyelesaian) — itu memang bentuknya, bukan duplikasi.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency, formatMonthYear, formatNumber, formatQuantity } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Dokumen Penyelesaian", align: "left", width: 38 },
  { header: "Pekerjaan", align: "left", width: 42 },
  { header: "Barang", align: "left", width: 68 },
  { header: "Qty", align: "right", width: 24 },
  { header: "Harga / Unit", align: "right", width: 45 },
  { header: "Total Biaya", align: "right", width: 50 },
]

export interface JobOrderCompletionInput {
  /** Nomor dokumen penyelesaian (`ProductionGenealogy.documentNo`). */
  documentNo: string
  /** Tanggal selesai (`completedAt`). */
  date: Date
  /** Nomor perintah kerja / perintah produksi tempat barang ini dikerjakan. */
  jobLabel: string
  itemCode: string
  itemName: string
  qty: number
  unitCost: number
  totalCost: number
}

export interface JobOrderCompletionTotals {
  qty: number
  totalCost: number
}

export interface JobOrderCompletionResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: JobOrderCompletionTotals
  documentCount: number
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function quantity(value: number): string {
  return formatQuantity(value)
}

function monthLabel(date: Date): string {
  return formatMonthYear(date)
}

/**
 * Susun laporan penyelesaian, dikelompokkan per bulan penyelesaian dengan
 * subtotal bulanan dan jumlah akhir.
 */
export function buildJobOrderCompletion(input: {
  completions: JobOrderCompletionInput[]
  start: Date
  end: Date
}): JobOrderCompletionResult {
  const { completions, start, end } = input
  const inPeriod = (date: Date) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  const visible = completions
    .filter((completion) => inPeriod(completion.date))
    .sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime()
      return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
    })

  const rows: TableRow[] = []
  const totals: JobOrderCompletionTotals = { qty: 0, totalCost: 0 }

  const months = new Map<string, JobOrderCompletionInput[]>()
  for (const completion of visible) {
    const key = monthLabel(completion.date)
    months.set(key, [...(months.get(key) ?? []), completion])
  }

  for (const [month, monthCompletions] of months) {
    rows.push({ kind: "group", label: month })

    const monthTotals = { qty: 0, totalCost: 0 }
    for (const completion of monthCompletions) {
      monthTotals.qty += completion.qty
      monthTotals.totalCost = safeAdd(monthTotals.totalCost, completion.totalCost, 2)
      rows.push({
        kind: "data",
        cells: [
          completion.documentNo,
          completion.jobLabel,
          `${completion.itemCode} ${completion.itemName}`.trim(),
          quantity(completion.qty),
          amount(completion.unitCost),
          amount(completion.totalCost),
        ],
      })
    }

    rows.push({
      kind: "total",
      label: `Jumlah ${month}`,
      cells: ["", "", "", quantity(monthTotals.qty), "", amount(monthTotals.totalCost)],
    })

    totals.qty += monthTotals.qty
    totals.totalCost = safeAdd(totals.totalCost, monthTotals.totalCost, 2)
  }

  if (visible.length === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada penyelesaian pesanan pada periode ini. Penyelesaian tercatat saat perintah produksi dilepas ke stok.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: ["", "", "", quantity(totals.qty), "", amount(totals.totalCost)],
    })
  }

  return { table: { columns: COLUMNS, rows }, totals, documentCount: visible.length }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function jobOrderCompletionSummary(result: JobOrderCompletionResult): string {
  const unitCost = result.totals.qty > 0 ? result.totals.totalCost / result.totals.qty : 0
  return (
    `${result.documentCount} dokumen penyelesaian · ${formatNumber(result.totals.qty)} unit · ` +
    `nilai ${formatCurrency(result.totals.totalCost)} (rata-rata ${formatCurrency(unitCost)} per unit)`
  )
}
