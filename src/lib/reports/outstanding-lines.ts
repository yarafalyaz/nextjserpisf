/**
 * Baris pesanan yang belum dipenuhi — mesin bersama untuk dua laporan:
 * **Barang Diterima Sebagian** (sisi pembelian) dan **Pemenuhan Pesanan**
 * (sisi penjualan).
 *
 * Keduanya punya bentuk yang sama persis: satu dokumen pesanan, baris-baris
 * dengan kuantitas dipesan vs yang sudah dipenuhi, sisa, dan nilai sisa. Menyalin
 * mesinnya berarti dua tempat yang menerapkan aturan "kuantitas tidak dijumlahkan
 * lintas satuan" — dan cukup satu di antaranya yang diperbaiki agar dua laporan
 * berbeda kebiasaan. Karena itu inti hitungannya di sini; tiap laporan hanya
 * memasok judul kolom dan kata yang tepat ("diterima" vs "terkirim").
 *
 * Dua aturan yang dipegang mesin ini:
 *
 * - **Hanya baris bersisa yang ditampilkan** — ini daftar tindak lanjut, bukan
 *   riwayat; baris yang sudah penuh akan mengubur yang perlu dikejar.
 * - **Kuantitas tidak dijumlahkan lintas satuan.** Satu dokumen bisa memuat pcs,
 *   liter, dan kg; total gabungannya angka yang tidak berarti. Yang bertotal hanya
 *   **nilai sisa** (sisa × harga satuan), dengan catatan bila satuannya campur.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatQuantity, formatDate } from "@/lib/utils/format"
import { safeAdd, safeMultiply } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface OutstandingLineItem {
  sku: string | null
  name: string
  /** Satuan barang (`Item.unitOfMeasure`). */
  unit: string | null
  orderedQty: number
  /** Kuantitas yang sudah diterima (pembelian) atau terkirim (penjualan). */
  fulfilledQty: number
  unitPrice: number
}

export interface OutstandingDocument {
  documentNo: string
  date: Date
  /** Pemasok (pembelian) atau pelanggan (penjualan). */
  partyName: string | null
  status: string
  items: OutstandingLineItem[]
}

export interface OutstandingTotals {
  documents: number
  items: number
  /** Baris dengan 0 < dipenuhi < dipesan. */
  partiallyFulfilled: number
  /** Baris yang belum dipenuhi satu unit pun. */
  notFulfilled: number
  /** Nilai sisa = Σ (sisa × harga satuan). Kuantitas sengaja tidak dijumlahkan. */
  outstandingValue: number
}

export interface OutstandingResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: OutstandingTotals
  hasMixedUnits: boolean
}

export interface OutstandingWording {
  /** Judul kolom, mis. "Diterima" / "Terkirim". */
  fulfilledColumn: string
  /** Kata kerja pasif untuk catatan, mis. "diterima" / "terkirim". */
  fulfilledPast: string
  /** Kata kerja aktif untuk catatan baris yang belum dipenuhi, mis. "menerima" / "terkirim". */
  fulfilledActive: string
  emptyNotice: string
}

/** Toleransi pembulatan kuantitas (dua desimal di DB). */
const EPSILON = 0.0001

function quantity(value: number): string {
  return formatQuantity(value)
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

/** Susun daftar baris bersisa untuk periode [start, end]. */
export function buildOutstandingLines(input: {
  documents: OutstandingDocument[]
  start: Date
  end: Date
  wording: OutstandingWording
}): OutstandingResult {
  const { documents, start, end, wording } = input
  const inPeriod = (date: Date) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  const columns: TableColumn[] = [
    { header: "Barang", align: "left", width: 85 },
    { header: "Dipesan", align: "right", width: 30 },
    { header: wording.fulfilledColumn, align: "right", width: 30 },
    { header: "Kurang", align: "right", width: 30 },
    { header: "Satuan", align: "left", width: 27 },
    { header: "Nilai Sisa", align: "right", width: 65 },
  ]

  const visible = documents
    .filter((document) => inPeriod(document.date))
    .sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime()
      return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
    })

  const rows: TableRow[] = []
  const totals: OutstandingTotals = {
    documents: 0,
    items: 0,
    partiallyFulfilled: 0,
    notFulfilled: 0,
    outstandingValue: 0,
  }
  const units = new Set<string>()

  for (const document of visible) {
    const outstanding = document.items
      .map((item) => ({ item, remaining: item.orderedQty - item.fulfilledQty }))
      .filter(({ remaining }) => remaining > EPSILON)

    if (outstanding.length === 0) continue
    totals.documents += 1

    rows.push({
      kind: "group",
      label: [
        document.documentNo,
        shortDate(document.date),
        document.partyName ?? "–",
        document.status,
      ].join(" · "),
    })

    let documentValue = 0

    for (const { item, remaining } of outstanding) {
      const value = safeMultiply(remaining, item.unitPrice, 2)
      documentValue = safeAdd(documentValue, value, 2)
      totals.items += 1
      if (item.fulfilledQty > EPSILON) totals.partiallyFulfilled += 1
      else totals.notFulfilled += 1
      if (item.unit) units.add(item.unit)

      rows.push({
        kind: "data",
        cells: [
          `${item.sku ? `${item.sku} ` : ""}${item.name}`.trim(),
          quantity(item.orderedQty),
          quantity(item.fulfilledQty),
          quantity(remaining),
          item.unit ?? "–",
          amount(value),
        ],
      })
    }

    rows.push({
      kind: "total",
      label: `Nilai sisa ${document.documentNo}`,
      cells: ["", "", "", "", "", amount(documentValue)],
    })
    totals.outstandingValue = safeAdd(totals.outstandingValue, documentValue, 2)
  }

  if (totals.documents === 0) {
    rows.push({ kind: "notice", text: wording.emptyNotice })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah Nilai Sisa",
      cells: ["", "", "", "", "", amount(totals.outstandingValue)],
    })
  }

  const hasMixedUnits = units.size > 1
  if (hasMixedUnits) {
    rows.push({
      kind: "notice",
      text:
        `Periode ini memuat lebih dari satu satuan, jadi kolom kuantitas (Dipesan, ${wording.fulfilledColumn}, ` +
        `Kurang) TIDAK dijumlahkan — hanya kolom nilai sisa yang bertotal.`,
    })
  }

  if (totals.items > 0 && totals.notFulfilled > 0 && totals.partiallyFulfilled > 0) {
    rows.push({
      kind: "notice",
      text:
        `Daftar ini memuat ${totals.partiallyFulfilled} baris yang sudah ${wording.fulfilledPast} sebagian dan ` +
        `${totals.notFulfilled} baris yang belum ${wording.fulfilledActive} satu unit pun.`,
    })
  }

  return { table: { columns, rows }, totals, hasMixedUnits }
}
