/**
 * Lembar penghitungan stok — dokumen opname per gudang beserta baris hitungnya:
 * kuantitas menurut sistem, kuantitas hasil hitung, selisih, dan nilainya.
 *
 * Dua keputusan yang disengaja:
 *
 * - **Selisih dihitung `actualQty − systemQty`, bukan dibaca dari kolom
 *   `difference`.** Kolom itu tersimpan, tetapi kalau suatu saat tidak sinkron
 *   (mis. baris lama diedit manual), laporan akan menampilkan angka yang tidak
 *   bisa dijelaskan dari kolom di sebelahnya. Menghitung ulang membuat laporan
 *   selalu bisa diperiksa sendiri.
 * - **Kuantitas TIDAK dijumlahkan lintas baris.** Satu lembar bisa memuat kg, pcs,
 *   dan liter sekaligus; menjumlahkannya menghasilkan angka yang tidak berarti.
 *   Yang dijumlahkan hanya **nilai** selisih. Kalau periode ini memuat satuan
 *   berbeda, laporan menambahkan catatan supaya tidak ada yang mengira kolom
 *   kuantitas adalah total.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency, formatQuantity, formatDate } from "@/lib/utils/format"
import { safeAdd, safeMultiply } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Barang", align: "left", width: 90 },
  { header: "Menurut Sistem", align: "right", width: 28 },
  { header: "Hasil Hitung", align: "right", width: 28 },
  { header: "Selisih", align: "right", width: 28 },
  { header: "Satuan", align: "left", width: 25 },
  { header: "Nilai Selisih", align: "right", width: 68 },
]

export interface StockCountItemInput {
  sku: string | null
  name: string
  systemQty: number
  actualQty: number
  unit: string | null
  /** Harga satuan yang dipakai lembar ini untuk menilai selisih. */
  unitCost: number
}

export interface StockCountDocumentInput {
  documentNo: string
  date: Date
  warehouseName: string | null
  status: string
  items: StockCountItemInput[]
}

export interface StockCountTotals {
  documents: number
  items: number
  /** Hanya nilai yang dijumlahkan — kuantitas lintas satuan tidak bermakna. */
  differenceValue: number
  /** Barang dengan selisih bukan nol. */
  itemsWithDifference: number
}

export interface StockCountResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: StockCountTotals
  /** Ada lebih dari satu satuan pada periode ini. */
  hasMixedUnits: boolean
}

function quantity(value: number): string {
  return formatQuantity(value)
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

/** Status ditampilkan apa adanya dalam bahasa Indonesia seperlunya. */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "draft",
    approved: "disetujui",
    posted: "terposting",
    completed: "selesai",
    cancelled: "dibatalkan",
  }
  return map[status] ?? status
}

/**
 * Susun lembar penghitungan stok untuk periode [start, end], dikelompokkan per
 * dokumen dengan subtotal nilai per dokumen dan jumlah akhir.
 */
export function buildStockCount(input: {
  documents: StockCountDocumentInput[]
  start: Date
  end: Date
}): StockCountResult {
  const { documents, start, end } = input
  const inPeriod = (date: Date) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  const visible = documents
    .filter((document) => inPeriod(document.date))
    .sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime()
      return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
    })

  const rows: TableRow[] = []
  const totals: StockCountTotals = { documents: 0, items: 0, differenceValue: 0, itemsWithDifference: 0 }
  const units = new Set<string>()

  for (const document of visible) {
    totals.documents += 1

    const header = [
      document.documentNo,
      shortDate(document.date),
      document.warehouseName ?? "Tanpa gudang",
      statusLabel(document.status),
    ].join(" · ")
    rows.push({ kind: "group", label: header })

    let documentValue = 0

    for (const item of document.items) {
      const difference = item.actualQty - item.systemQty
      const value = safeMultiply(difference, item.unitCost, 2)
      documentValue = safeAdd(documentValue, value, 2)
      totals.items += 1
      if (Math.abs(difference) > 0.0001) totals.itemsWithDifference += 1
      if (item.unit) units.add(item.unit)

      rows.push({
        kind: "data",
        cells: [
          `${item.sku ? `${item.sku} ` : ""}${item.name}`.trim(),
          quantity(item.systemQty),
          quantity(item.actualQty),
          quantity(difference),
          item.unit ?? "–",
          amount(value),
        ],
      })
    }

    rows.push({
      kind: "total",
      label: `Nilai selisih ${document.documentNo}`,
      cells: ["", "", "", "", "", amount(documentValue)],
    })
    totals.differenceValue = safeAdd(totals.differenceValue, documentValue, 2)
  }

  if (visible.length === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada lembar penghitungan stok pada periode ini. Lembar dibuat di Inventaris → Stok Opname.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah Nilai Selisih",
      cells: ["", "", "", "", "", amount(totals.differenceValue)],
    })
  }

  const hasMixedUnits = units.size > 1
  if (hasMixedUnits) {
    rows.push({
      kind: "notice",
      text:
        "Periode ini memuat lebih dari satu satuan pengukuran, jadi kolom kuantitas (Menurut Sistem, Hasil " +
        "Hitung, Selisih) sengaja TIDAK dijumlahkan — hanya kolom nilai yang bertotal.",
    })
  }

  if (totals.items > 0 && totals.itemsWithDifference === 0) {
    rows.push({ kind: "notice", text: "Seluruh baris cocok dengan sistem: tidak ada selisih pada periode ini." })
  }

  return { table: { columns: COLUMNS, rows }, totals, hasMixedUnits }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function stockCountSummary(result: StockCountResult): string {
  return (
    `${result.totals.documents} lembar · ${result.totals.items} baris hitung · ` +
    `${result.totals.itemsWithDifference} baris berselisih · nilai selisih ` +
    `${formatCurrency(result.totals.differenceValue)}`
  )
}
