/**
 * Barang diterima sebagian — pesanan pembelian yang barisnya belum diterima
 * penuh: berapa yang dipesan, berapa yang sudah masuk, dan berapa sisanya.
 *
 * Inti hitungannya ada di `outstanding-lines.ts` bersama laporan **Pemenuhan
 * Pesanan** (sisi penjualan), karena bentuk keduanya sama persis — termasuk aturan
 * bahwa kuantitas tidak dijumlahkan lintas satuan.
 *
 * Berkas ini mempertahankan nama medan sisi pembelian (`receivedQty`,
 * `vendorName`) yang sudah dipakai pemuat data dan tesnya, lalu menerjemahkannya
 * ke bentuk netral mesin bersama. Yang berubah nama hanya di dalam sini, supaya
 * pemanggil lama tidak perlu ikut berubah.
 */

import { formatCurrency } from "@/lib/utils/format"
import {
  buildOutstandingLines,
  type OutstandingDocument,
  type OutstandingWording,
} from "@/lib/reports/outstanding-lines"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

const WORDING: OutstandingWording = {
  fulfilledColumn: "Diterima",
  fulfilledPast: "diterima",
  fulfilledActive: "menerima",
  emptyNotice: "Tidak ada pesanan pembelian dengan sisa penerimaan pada periode ini.",
}

export interface PurchaseOutstandingItemInput {
  sku: string | null
  name: string
  /** Satuan barang (`Item.unitOfMeasure`). */
  unit: string | null
  orderedQty: number
  /** Kuantitas yang sudah diterima (`PurchaseOrderItem.receivedQty`). */
  receivedQty: number
  unitPrice: number
}

export interface PurchaseOrderOutstandingInput {
  documentNo: string
  date: Date
  vendorName: string | null
  status: string
  items: PurchaseOutstandingItemInput[]
}

export interface PurchaseOutstandingTotals {
  orders: number
  items: number
  /** Baris dengan 0 < diterima < dipesan. */
  partiallyReceived: number
  /** Baris yang belum menerima satu unit pun. */
  notReceived: number
  outstandingValue: number
}

export interface PurchaseOutstandingResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: PurchaseOutstandingTotals
  hasMixedUnits: boolean
}

/** Susun daftar baris bersisa per pesanan pembelian untuk periode [start, end]. */
export function buildPurchaseOutstanding(input: {
  orders: PurchaseOrderOutstandingInput[]
  start: Date
  end: Date
}): PurchaseOutstandingResult {
  const documents: OutstandingDocument[] = input.orders.map((order) => ({
    documentNo: order.documentNo,
    date: order.date,
    partyName: order.vendorName,
    status: order.status,
    items: order.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      orderedQty: item.orderedQty,
      fulfilledQty: item.receivedQty,
      unitPrice: item.unitPrice,
    })),
  }))

  const result = buildOutstandingLines({
    documents,
    start: input.start,
    end: input.end,
    wording: WORDING,
  })

  return {
    table: result.table,
    hasMixedUnits: result.hasMixedUnits,
    totals: {
      orders: result.totals.documents,
      items: result.totals.items,
      partiallyReceived: result.totals.partiallyFulfilled,
      notReceived: result.totals.notFulfilled,
      outstandingValue: result.totals.outstandingValue,
    },
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function purchaseOutstandingSummary(result: PurchaseOutstandingResult): string {
  return (
    `${result.totals.orders} pesanan · ${result.totals.items} baris bersisa ` +
    `(${result.totals.partiallyReceived} diterima sebagian, ${result.totals.notReceived} belum menerima) · ` +
    `nilai sisa ${formatCurrency(result.totals.outstandingValue)}`
  )
}
