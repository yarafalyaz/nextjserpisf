/**
 * Pemenuhan pesanan — pesanan penjualan yang barisnya belum dikirim penuh:
 * berapa yang dipesan pelanggan, berapa yang sudah keluar, dan berapa sisanya.
 *
 * Pasangan penjualan dari **Barang Diterima Sebagian** (sisi pembelian), dan
 * keduanya memakai inti hitungan yang sama di `outstanding-lines.ts` — termasuk
 * aturan kuantitas tidak dijumlahkan lintas satuan.
 *
 * Satu beda penting dari sisi pembelian: **tidak ada akumulator terkirim** di
 * baris pesanan (`SalesOrderItem` tidak punya kolom seperti
 * `PurchaseOrderItem.receivedQty`), jadi yang terkirim dijumlahkan dari baris
 * surat jalan yang menunjuk baris pesanan (`DeliveryOrderItem.salesOrderItemId`).
 * Itu sebabnya pemanggil harus menyaring status surat jalan lebih dulu — draft
 * belum keluar dari gudang dan tidak boleh mengurangi sisa.
 */

import { formatCurrency } from "@/lib/utils/format"
import {
  buildOutstandingLines,
  type OutstandingDocument,
  type OutstandingWording,
} from "@/lib/reports/outstanding-lines"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

const WORDING: OutstandingWording = {
  fulfilledColumn: "Terkirim",
  fulfilledPast: "terkirim",
  fulfilledActive: "terkirim",
  emptyNotice: "Tidak ada pesanan penjualan dengan sisa pengiriman pada periode ini.",
}

export type SalesOrderFulfillmentInput = OutstandingDocument

export interface OrderFulfillmentTotals {
  orders: number
  items: number
  /** Baris dengan 0 < terkirim < dipesan. */
  partiallyShipped: number
  /** Baris yang belum terkirim satu unit pun. */
  notShipped: number
  outstandingValue: number
}

export interface OrderFulfillmentResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: OrderFulfillmentTotals
  hasMixedUnits: boolean
}

/** Susun daftar baris bersisa per pesanan penjualan untuk periode [start, end]. */
export function buildOrderFulfillment(input: {
  orders: SalesOrderFulfillmentInput[]
  start: Date
  end: Date
}): OrderFulfillmentResult {
  const result = buildOutstandingLines({
    documents: input.orders,
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
      partiallyShipped: result.totals.partiallyFulfilled,
      notShipped: result.totals.notFulfilled,
      outstandingValue: result.totals.outstandingValue,
    },
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function orderFulfillmentSummary(result: OrderFulfillmentResult): string {
  return (
    `${result.totals.orders} pesanan · ${result.totals.items} baris bersisa ` +
    `(${result.totals.partiallyShipped} terkirim sebagian, ${result.totals.notShipped} belum terkirim) · ` +
    `nilai sisa ${formatCurrency(result.totals.outstandingValue)}`
  )
}
