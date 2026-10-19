/**
 * Pembelian per Pemasok / Barang / Biaya.
 *
 * Nilai yang dilaporkan adalah **DPP** (`subtotal − diskon` per baris), bukan
 * `grandTotal` — supaya PPN tidak terbaca sebagai belanja. PPN ditampilkan pada
 * kolomnya sendiri.
 *
 * Satu tagihan bisa muncul di beberapa kelompok (mis. tagihan berisi dua barang),
 * jadi **jumlah dokumen per kelompok tidak dijumlahkan** menjadi total dokumen;
 * total dokumen dihitung sekali dari tagihan yang unik.
 *
 * Kuantitas sengaja tidak ditampilkan/dijumlahkan karena satuan antar barang
 * berbeda (pcs, kg, m) — menjumlahkannya akan menyesatkan.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export const PURCHASE_DIMENSIONS = ["pemasok", "barang", "biaya"] as const
export type PurchaseDimension = (typeof PURCHASE_DIMENSIONS)[number]

export const PURCHASE_DIMENSION_LABEL: Record<PurchaseDimension, string> = {
  pemasok: "Pemasok",
  barang: "Barang",
  biaya: "Biaya",
}

/** Lebar kolom (mm) — jumlahnya 262mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Kelompok", align: "left", width: 98 },
  { header: "Dokumen", align: "right", width: 26 },
  { header: "Nilai (DPP)", align: "right", width: 46 },
  { header: "PPN", align: "right", width: 44 },
  { header: "Total", align: "right", width: 48 },
]

export interface PurchaseLineInput {
  key: string
  label: string
  /** Nomor tagihan unik pada kelompok ini. */
  documentNos: string[]
  dpp: number
  tax: number
}

export interface PurchaseByDimensionTotals {
  documents: number
  dpp: number
  tax: number
  total: number
}

export interface PurchaseByDimensionResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: PurchaseByDimensionTotals
  verdict: string
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

export function buildPurchasesByDimension(input: {
  lines: PurchaseLineInput[]
  dimension: PurchaseDimension
  /** Jumlah tagihan unik pada periode (bukan penjumlahan kolom Dokumen). */
  documentCount: number
}): PurchaseByDimensionResult {
  const visible = input.lines
    .filter((line) => line.dpp !== 0 || line.tax !== 0)
    .sort((a, b) => {
      if (b.dpp !== a.dpp) return b.dpp - a.dpp
      return a.label.localeCompare(b.label, "id-ID")
    })

  const totals: PurchaseByDimensionTotals = { documents: input.documentCount, dpp: 0, tax: 0, total: 0 }
  for (const line of visible) {
    totals.dpp = safeAdd(totals.dpp, line.dpp, 2)
    totals.tax = safeAdd(totals.tax, line.tax, 2)
  }
  totals.total = safeAdd(totals.dpp, totals.tax, 2)

  const rows: TableRow[] = visible.map((line) => ({
    kind: "data",
    cells: [
      line.label,
      String(new Set(line.documentNos).size),
      amount(line.dpp),
      amount(line.tax),
      amount(safeAdd(line.dpp, line.tax, 2)),
    ],
  }))

  if (visible.length === 0) {
    rows.push({
      kind: "notice",
      text:
        "Tidak ada pembelian pada periode ini. Pastikan tagihan vendor sudah diposting " +
        "dan tanggalnya masuk periode yang dipilih.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [String(totals.documents), amount(totals.dpp), amount(totals.tax), amount(totals.total)],
    })
  }

  rows.push({
    kind: "notice",
    text:
      "Nilai adalah DPP (subtotal − diskon) sebelum PPN. Total dokumen dihitung dari tagihan unik, " +
      "bukan penjumlahan kolom Dokumen (satu tagihan bisa masuk beberapa kelompok). " +
      "Kuantitas tidak ditampilkan karena satuan antar barang berbeda. " +
      `Dimensi: per ${PURCHASE_DIMENSION_LABEL[input.dimension]}.`,
  })

  const verdict =
    visible.length === 0
      ? "Tidak ada pembelian pada periode ini"
      : `Pembelian ${formatCurrency(totals.dpp)} (DPP) + PPN ${formatCurrency(totals.tax)} dari ${totals.documents} tagihan`

  return { table: { columns: COLUMNS, rows }, totals, verdict }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function purchaseByDimensionSummary(result: PurchaseByDimensionResult): string {
  if (result.totals.documents === 0) return "Tidak ada pembelian pada periode ini"
  return (
    `${result.totals.documents} tagihan · DPP ${formatCurrency(result.totals.dpp)} · ` +
    `PPN ${formatCurrency(result.totals.tax)} · total ${formatCurrency(result.totals.total)}`
  )
}
