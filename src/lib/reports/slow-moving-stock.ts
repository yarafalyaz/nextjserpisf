/**
 * Stok tidak bergerak (slow-moving) — laporan **pemeriksaan** persediaan.
 *
 * Barang dengan sisa stok > 0 tetapi tanpa pergerakan keluar (StockMove
 * impact OUT berstatus posted) selama ambang hari berjalan adalah modal
 * yang mengendap: patut diperiksa (usang, salah beli, atau memang stok
 * pengaman). Laporan umur stok existing mengelompokkan lapisan FIFO
 * menurut umur lapisan; laporan ini menjawab pertanyaan berbeda —
 * "barang apa yang masih ada tetapi sudah lama tidak keluar?" — dari
 * pergerakan keluar terakhir per barang.
 *
 * Aturan jujur:
 * - Hanya barang aktif (isActive, belum dihapus) dengan sisa lapisan
 *   FIFO > 0 yang dinilai; jasa (isService) dikeluarkan — tak ada stok.
 * - "Keluar" = StockMove posted impact OUT. Transfer keluar antar
 *   gudang ikut terhitung keluar (barang bergerak, bukan mati) —
 *   dinyatakan di catatan, bukan disembunyikan.
 * - Barang yang tidak pernah keluar sama sekali tampil dengan label
 *   "Belum pernah keluar", bukan umur karangan 0 hari.
 * - Nilai per barang menurut metode barangnya (average dari harga
 *   pokok barang, fifo dari harga lapisan) — basis yang sama dengan
 *   Valuasi Stok, persis sen; qty tidak dijumlah lintas satuan.
 * - Ambang baku 90 hari; pemanggil boleh mengganti.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency, formatQuantity, formatDate } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"
import { layerValue, resolveCostingMethod } from "@/lib/reports/stock-valuation"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export const SLOW_MOVING_DEFAULT_THRESHOLD_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

const COLUMNS: TableColumn[] = [
  { header: "Barang", align: "left", width: 92 },
  { header: "Kategori", align: "left", width: 36 },
  { header: "Sisa", align: "right", width: 26 },
  { header: "Satuan", align: "left", width: 22 },
  { header: "Keluar Terakhir", align: "left", width: 34 },
  { header: "Nilai Sisa", align: "right", width: 50 },
]

export interface SlowMovingItemInput {
  sku: string | null
  name: string
  categoryName: string | null
  unit: string | null
  /** Sisa kuantitas lapisan (agregat semua gudang). */
  remainingQty: number
  /** Nilai sisa menurut metode barang, persis sen. */
  remainingValue: number
  /** Tanggal StockMove OUT posted terakhir; null = belum pernah keluar. */
  lastOutDate: Date | null
}

export interface SlowMovingResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: {
    /** Barang dinilai (sisa > 0, non-jasa, aktif). */
    assessed: number
    /** Barang masuk daftar tidak bergerak. */
    slow: number
    /** Barang belum pernah keluar sama sekali. */
    neverMoved: number
    /** Nilai sisa seluruh barang tidak bergerak. */
    slowValue: number
    /** Nilai sisa seluruh barang dinilai. */
    assessedValue: number
  }
  verdict: string
}

/** Hari penuh sejak keluar terakhir; null bila belum pernah keluar. */
export function daysSinceLastOut(lastOutDate: Date | null, asOf: Date): number | null {
  if (!lastOutDate) return null
  const start = new Date(
    lastOutDate.getFullYear(),
    lastOutDate.getMonth(),
    lastOutDate.getDate(),
  ).getTime()
  const end = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime()
  return Math.round((end - start) / DAY_MS)
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

function quantity(value: number): string {
  return formatQuantity(value)
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

export function buildSlowMovingStock(input: {
  items: SlowMovingItemInput[]
  asOf: Date
  thresholdDays?: number
}): SlowMovingResult {
  const threshold = input.thresholdDays ?? SLOW_MOVING_DEFAULT_THRESHOLD_DAYS
  const assessed = input.items.filter((item) => item.remainingQty > 0)

  const slow = assessed
    .map((item) => ({ item, idleDays: daysSinceLastOut(item.lastOutDate, input.asOf) }))
    .filter(({ idleDays }) => idleDays === null || idleDays >= threshold)
    // Paling lama mengendap dulu; belum pernah keluar di atas yang pernah.
    .sort((a, b) => {
      if (a.idleDays === null && b.idleDays === null)
        return b.item.remainingValue - a.item.remainingValue
      if (a.idleDays === null) return -1
      if (b.idleDays === null) return 1
      return b.idleDays - a.idleDays || b.item.remainingValue - a.item.remainingValue
    })

  const rows: TableRow[] = []
  const units = new Set<string>()
  let slowValue = 0
  for (const { item, idleDays } of slow) {
    slowValue = safeAdd(slowValue, item.remainingValue, 2)
    if (item.unit) units.add(item.unit)
    rows.push({
      kind: "data",
      cells: [
        `${item.sku ? `${item.sku} ` : ""}${item.name}`.trim(),
        item.categoryName ?? "–",
        quantity(item.remainingQty),
        item.unit ?? "–",
        item.lastOutDate
          ? `${shortDate(item.lastOutDate)} (${idleDays} hari)`
          : "Belum pernah keluar",
        amount(item.remainingValue),
      ],
    })
  }

  const assessedValue = assessed.reduce(
    (sum, item) => safeAdd(sum, item.remainingValue, 2),
    0,
  )
  const neverMoved = slow.filter(({ item }) => item.lastOutDate === null).length

  let verdict: string
  if (assessed.length === 0) {
    verdict = "Tidak ada barang bersisa stok untuk dinilai."
    rows.push({
      kind: "notice",
      text: "Tidak ada barang aktif dengan sisa stok pada tanggal acuan ini.",
    })
  } else if (slow.length === 0) {
    verdict = `Semua ${assessed.length} barang bersisa bergerak dalam ${threshold} hari terakhir.`
    rows.push({
      kind: "notice",
      text: `Tidak ada barang dengan sisa stok yang tidak keluar selama ${threshold} hari atau lebih.`,
    })
  } else {
    verdict =
      `${slow.length} dari ${assessed.length} barang bersisa tidak bergerak ` +
      `≥ ${threshold} hari, senilai ${formatCurrency(slowValue)}.`
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah Nilai Stok Tidak Bergerak",
      cells: ["", "", "", "", "", amount(slowValue)],
    })
    rows.push({
      kind: "notice",
      text:
        "Nilai sisa menurut metode barang (average dari harga pokok barang, fifo dari harga lapisan), sama dengan basis Valuasi Stok. " +
        "Pergerakan keluar transfer antar gudang terhitung sebagai keluar — barang yang hanya " +
        "berpindah gudang tidak masuk daftar ini. Barang \"Belum pernah keluar\" belum pernah " +
        "mencatat pergerakan keluar posted sejak tercatat di sistem.",
    })
    if (neverMoved > 0) {
      rows.push({
        kind: "notice",
        text: `${neverMoved} barang di antaranya belum pernah keluar sama sekali — periksa apakah memang stok pengaman atau salah beli.`,
      })
    }
  }

  if (units.size > 1) {
    rows.push({
      kind: "notice",
      text: "Daftar memuat lebih dari satu satuan, jadi kolom sisa TIDAK dijumlahkan — hanya kolom nilai yang bertotal.",
    })
  }

  return {
    table: { columns: COLUMNS, rows },
    totals: {
      assessed: assessed.length,
      slow: slow.length,
      neverMoved,
      slowValue,
      assessedValue,
    },
    verdict,
  }
}

/**
 * Nilai lapisan kanonis -> input barang (dipakai loader; persis sen).
 * Input = keluaran `toValuationLayers`; metode efektif per barang lewat
 * `resolveCostingMethod` (kategori > barang > global > fifo), nilai per
 * lapisan lewat `layerValue` — persis jalur `buildStockValuation`, supaya
 * nominal per barang identik Valuasi Stok untuk fifo DAN average.
 */
export function slowMovingValueOfLayers(
  layers: {
    remaining: number
    unitCost: number
    item: {
      cost: number
      costingMethod: string | null
      category: { costingMethod: string | null } | null
    }
  }[],
  globalMethod?: string | null,
): { remainingQty: number; remainingValue: number } {
  let remainingQty = 0
  let remainingValue = 0
  for (const layer of layers) {
    remainingQty = safeAdd(remainingQty, layer.remaining, 2)
    remainingValue = safeAdd(
      remainingValue,
      layerValue(layer, resolveCostingMethod(layer.item, globalMethod)),
      2,
    )
  }
  return { remainingQty, remainingValue }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function slowMovingSummary(result: SlowMovingResult): string {
  if (result.totals.assessed === 0) return "Tidak ada barang bersisa"
  if (result.totals.slow === 0) return "Tidak ada stok tidak bergerak"
  return `${result.totals.slow} barang · nilai ${formatCurrency(result.totals.slowValue)}`
}
