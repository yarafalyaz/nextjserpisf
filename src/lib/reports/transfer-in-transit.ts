/**
 * Persediaan terkirim belum diterima — laporan **pemeriksaan**.
 *
 * Pemindahan barang antar gudang di sistem ini dua langkah: **Kirim**
 * (`processInventoryTransfer`) mengeluarkan stok dari gudang asal — lapisan FIFO
 * di sana benar-benar berkurang — lalu **Terima** (`receiveInventoryTransfer`)
 * baru menambahkannya di gudang tujuan. Selama statusnya `processed`
 * (belum diterima sama sekali) atau `partially_received` (diterima
 * sebagian, F-2026-10-22-081-S), barang itu **ada di jalan**: sudah
 * keluar dari satu gudang, belum masuk gudang lain. Kuantitas yang
 * dilaporkan per item = SISA belum diterima (terkirim dikurangi
 * diterima kumulatif per baris), sehingga laporan tak pernah
 * menghitung barang yang sudah tiba; transfer yang ditutup selisihnya
 * menjadi `received` dan keluar dari daftar, dengan selisihnya
 * berpindah ke akun penyesuaian lewat jurnal dokumen penutupan.
 *
 * Itu sebabnya laporan ini ada: selisih antara "stok menurut gudang asal" dan
 * "stok menurut gudang tujuan" punya penjelasan sah — barang dalam perjalanan —
 * tapi hanya bisa dinyatakan sah kalau daftarnya bisa diperiksa. Pemindahan yang
 * sudah berumur lama di daftar ini adalah barang yang patut dicurigai hilang.
 *
 * Nilainya diambil dari **pergerakan stok asli** (`StockMove` OUT milik
 * pemindahan itu: `qty × cost`), bukan dari harga pokok barang saat ini —
 * harga lot yang benar-benar keluar bisa berbeda dari harga pokok hari ini.
 *
 * Aturan yang sama dengan laporan persediaan lain: **kuantitas tidak dijumlahkan
 * lintas satuan**; hanya nilai yang bertotal, dengan catatan bila satuannya campur.
 *
 * Pure (tanpa Prisma/DOM).
 */

/** Status pemindahan yang berarti barang masih di jalan (penuh / sebagian). Sumber tunggal murni — loader me-re-export. */
export const IN_TRANSIT_TRANSFER_STATUSES = ["processed", "partially_received"] as const

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeMultiply } from "@/lib/utils/math"
import { AGING_BUCKETS, ageInDays } from "@/lib/reports/received-not-billed"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface InTransitItemInput {
  sku: string | null
  name: string
  unit: string | null
  qty: number
  /** Harga per satuan dari pergerakan stok; `null` bila pergerakannya tak ditemukan. */
  unitCost: number | null
}

export interface InTransitTransferInput {
  documentNo: string
  date: Date
  sourceName: string
  destinationName: string
  items: InTransitItemInput[]
}

export interface TransferInTransitInput {
  transfers: InTransitTransferInput[]
  /** Tanggal acuan umur (biasanya akhir periode). */
  asOf: Date
  periodEndIsToday: boolean
}

export interface TransferInTransitResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: {
    transfers: number
    items: number
    /** Σ qty × cost. */
    value: number
    /** Baris yang nilainya memakai harga pokok barang karena pergerakannya tidak ditemukan. */
    estimatedLines: number
  }
  aging: { label: string; value: number; transfers: number }[]
  verdict: string
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function quantity(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value)
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

function bucketOf(age: number): string {
  const bucket = AGING_BUCKETS.find((item) => age >= item.min && (item.max === null || age <= item.max))
  return bucket?.label ?? AGING_BUCKETS[AGING_BUCKETS.length - 1].label
}

export function buildTransferInTransit(input: TransferInTransitInput): TransferInTransitResult {
  const { transfers, asOf, periodEndIsToday } = input

  const columns: TableColumn[] = [
    { header: "Barang", align: "left", width: 100 },
    { header: "Jumlah", align: "right", width: 30 },
    { header: "Satuan", align: "left", width: 30 },
    { header: "Nilai", align: "right", width: 107 },
  ]
  const rows: TableRow[] = []

  const totals: TransferInTransitResult["totals"] = {
    transfers: 0,
    items: 0,
    value: 0,
    estimatedLines: 0,
  }
  const aging = AGING_BUCKETS.map((bucket) => ({ label: bucket.label, value: 0, transfers: 0 }))
  const units = new Set<string>()

  const ordered = [...transfers].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.documentNo.localeCompare(b.documentNo, "id-ID"),
  )

  for (const transfer of ordered) {
    if (transfer.items.length === 0) continue

    const age = ageInDays(transfer.date, asOf)
    const bucket = aging.find((item) => item.label === bucketOf(age))
    if (bucket) bucket.transfers += 1

    rows.push({
      kind: "group",
      label: [
        transfer.documentNo,
        shortDate(transfer.date),
        `${transfer.sourceName} → ${transfer.destinationName}`,
        `umur ${age} hari`,
      ].join(" · "),
    })

    let transferValue = 0
    for (const item of transfer.items) {
      const unitCost = item.unitCost
      const value = safeMultiply(item.qty, unitCost ?? 0, 2)
      if (unitCost === null) totals.estimatedLines += 1
      transferValue = safeAdd(transferValue, value, 2)
      totals.items += 1
      if (item.unit) units.add(item.unit)

      rows.push({
        kind: "data",
        cells: [
          `${item.sku ? `${item.sku} ` : ""}${item.name}`.trim(),
          quantity(item.qty),
          item.unit ?? "–",
          amount(value),
        ],
      })
    }

    rows.push({
      kind: "total",
      label: `Nilai dalam perjalanan ${transfer.documentNo}`,
      cells: ["", "", "", amount(transferValue)],
    })

    totals.transfers += 1
    totals.value = safeAdd(totals.value, transferValue, 2)
    if (bucket) bucket.value = safeAdd(bucket.value, transferValue, 2)
  }

  let verdict: string
  if (totals.transfers === 0) {
    verdict = "Tidak ada pemindahan yang masih dalam perjalanan."
    rows.push({
      kind: "notice",
      text: "Tidak ada pemindahan barang yang masih dalam perjalanan pada periode ini.",
    })
  } else {
    verdict = `${totals.transfers} pemindahan senilai ${formatCurrency(totals.value)} masih di jalan.`
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah Nilai Dalam Perjalanan",
      cells: ["", "", "", amount(totals.value)],
    })
    rows.push({
      kind: "notice",
      text:
        "Barang pada daftar ini sudah keluar dari gudang asal (stok dan lapisan FIFO di sana berkurang) tetapi " +
        "belum masuk gudang tujuan, sehingga selisih stok antar gudang punya penjelasan ini. Terima " +
        "pemindahannya agar stok gudang tujuan ikut bertambah.",
    })
  }

  const oldTransfers = aging
    .filter((bucket) => bucket.label === "Lebih dari 90 hari" || bucket.label === "61–90 hari")
    .reduce((sum, bucket) => sum + bucket.transfers, 0)
  if (oldTransfers > 0) {
    rows.push({
      kind: "notice",
      text:
        `Ada ${oldTransfers} pemindahan berumur lebih dari 60 hari yang belum diterima. Periksa apakah barangnya ` +
        `benar-benar sampai — pemindahan yang mengendap biasanya berarti barangnya hilang atau dokumennya terlupa.`,
    })
  }

  if (totals.estimatedLines > 0) {
    rows.push({
      kind: "notice",
      text:
        `${totals.estimatedLines} baris tidak menemukan pergerakan stoknya, sehingga nilainya dihitung dari harga ` +
        `pokok barang saat ini — bukan harga lot yang benar-benar keluar. Angka itu perkiraan, bukan nilai pasti.`,
    })
  }

  if (units.size > 1) {
    rows.push({
      kind: "notice",
      text:
        "Periode ini memuat lebih dari satu satuan, jadi kolom jumlah TIDAK dijumlahkan — hanya kolom nilai yang " +
        "bertotal.",
    })
  }

  if (!periodEndIsToday) {
    rows.push({
      kind: "notice",
      text:
        "Daftar ini adalah kondisi pemindahan SAAT INI, sedangkan periode yang dibuka bukan periode berjalan — " +
        "pemindahan yang sudah diterima setelah tanggal itu tidak lagi muncul di sini.",
    })
  }

  return { table: { columns, rows }, totals, aging, verdict }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function transferInTransitSummary(result: TransferInTransitResult): string {
  if (result.totals.transfers === 0) return "Tidak ada barang dalam perjalanan"
  return `${result.totals.transfers} pemindahan · ${result.totals.items} baris · nilai ${formatCurrency(result.totals.value)}`
}
