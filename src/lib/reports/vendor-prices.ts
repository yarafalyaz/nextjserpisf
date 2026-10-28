/**
 * Harga Pemasok — daftar harga per vendor per barang.
 *
 * Dua hal yang dijaga:
 *
 * - Kolom **Terendah** menandai penawaran termurah untuk barang itu **hanya bila
 *   pembandingnya ada di daftar yang sama** (periode sama). Bila hanya satu vendor
 *   yang punya harga, tanda itu tidak muncul — "terendah" dari satu baris tidak
 *   berarti apa-apa.
 * - Laporan menyebut tegas bahwa ini **data rujukan**: dokumen pembelian belum
 *   mengambil harga dari sini, jadi jangan dibaca sebagai harga yang mengikat.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatDate } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

const COLUMNS: TableColumn[] = [
  { header: "Pemasok", align: "left", width: 52 },
  { header: "Barang", align: "left", width: 66 },
  { header: "Min. Qty", align: "right", width: 22 },
  { header: "Harga", align: "right", width: 36 },
  { header: "Berlaku", align: "left", width: 34 },
  { header: "Terendah", align: "center", width: 20 },
]

export interface VendorPriceInput {
  vendorName: string
  itemKey: string
  itemLabel: string
  minQty: number
  price: number
  effectiveDate: Date | null
}

export interface VendorPriceResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: { count: number; vendors: number; items: number }
  verdict: string
}

/** Harga terendah per barang — hanya bila ada lebih dari satu penawaran. */
export function lowestPriceByItem(rows: VendorPriceInput[]): Map<string, number> {
  const grouped = new Map<string, number[]>()
  for (const row of rows) {
    const list = grouped.get(row.itemKey)
    if (list) list.push(row.price)
    else grouped.set(row.itemKey, [row.price])
  }

  const lowest = new Map<string, number>()
  for (const [itemKey, prices] of grouped) {
    // Satu penawaran bukan "terendah" — tidak ada pembanding.
    if (prices.length < 2) continue
    lowest.set(itemKey, Math.min(...prices))
  }
  return lowest
}

export function buildVendorPriceListing(rows: VendorPriceInput[]): VendorPriceResult {
  const lowest = lowestPriceByItem(rows)

  const sorted = [...rows].sort((a, b) => {
    const byItem = a.itemLabel.localeCompare(b.itemLabel, "id-ID")
    if (byItem !== 0) return byItem
    if (a.price !== b.price) return a.price - b.price
    return a.vendorName.localeCompare(b.vendorName, "id-ID")
  })

  const tableRows: TableRow[] = sorted.map((row) => {
    const cheapest = lowest.get(row.itemKey)
    return {
      kind: "data",
      cells: [
        row.vendorName,
        row.itemLabel,
        formatAccounting(row.minQty, { zeroDash: false }),
        formatAccounting(row.price, { zeroDash: false }),
        row.effectiveDate ? formatDate(row.effectiveDate) : "—",
        cheapest !== undefined && row.price === cheapest ? "✓" : "",
      ],
    }
  })

  if (sorted.length === 0) {
    tableRows.push({ kind: "notice", text: "Belum ada harga pemasok yang dicatat." })
  } else {
    tableRows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [String(sorted.length), "", "", "", "", ""],
    })
  }

  // Barang yang hanya punya satu penawaran tidak bisa dibandingkan.
  const uncomparable = [...new Set(sorted.map((row) => row.itemKey))].filter((key) => !lowest.has(key)).length
  if (uncomparable > 0) {
    tableRows.push({
      kind: "notice",
      text:
        `${uncomparable} barang hanya punya satu penawaran, jadi tidak ada pembanding harga — ` +
        "tanda terendah sengaja tidak diberikan.",
    })
  }

  tableRows.push({
    kind: "notice",
    text:
      "Ini **data rujukan**: dokumen pembelian belum mengambil harga dari daftar ini, " +
      "jadi angka di sini adalah catatan kesepakatan, bukan harga yang otomatis dipakai transaksi.",
  })

  const vendors = new Set(sorted.map((row) => row.vendorName)).size
  const items = new Set(sorted.map((row) => row.itemKey)).size

  return {
    table: { columns: COLUMNS, rows: tableRows },
    totals: { count: sorted.length, vendors, items },
    verdict:
      sorted.length === 0
        ? "Belum ada harga pemasok yang dicatat"
        : `${sorted.length} baris harga · ${vendors} pemasok · ${items} barang`,
  }
}

export function vendorPriceSummary(result: VendorPriceResult): string {
  if (result.totals.count === 0) return "Belum ada harga pemasok yang dicatat"
  const lowest = result.table.rows.filter((row) => row.kind === "data" && row.cells[5] === "✓").length
  return (
    `${result.totals.count} baris · ${result.totals.vendors} pemasok · ${result.totals.items} barang` +
    (lowest > 0 ? ` · ${lowest} penawaran termurah` : "")
  )
}
