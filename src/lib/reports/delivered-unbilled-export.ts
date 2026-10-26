/**
 * Tabel ekspor (PDF) antrean SO terkirim belum terfaktur penuh
 * (F-2026-10-26-058-S). Pemetaan format murni dari payload builder
 * `delivered-unbilled.ts` — UI/PDF dilarang hitung ulang; totals diambil
 * apa adanya dari queue. Dipakai registry PDF `terkirim-belum-terfaktur`.
 */

import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"
import {
  DELIVERED_UNBILLED_EMPTY_TEXT,
  type DeliveredUnbilledQueue,
} from "@/lib/reports/delivered-unbilled"
import { formatCurrency, formatDate } from "@/lib/utils/format"

const COLUMNS: TableColumn[] = [
  { header: "No. Pesanan", align: "left", width: 28 },
  { header: "Pelanggan", align: "left", width: 42 },
  { header: "Tanggal Pesanan", align: "left", width: 24 },
  { header: "Pengiriman Terakhir", align: "left", width: 24 },
  { header: "Umur (hari)", align: "right", width: 20 },
  { header: "Nilai Terkirim", align: "right", width: 30 },
  { header: "Nilai Terfaktur", align: "right", width: 30 },
  { header: "Belum Terfaktur", align: "right", width: 30 },
]

export function buildDeliveredUnbilledTable(queue: DeliveredUnbilledQueue): {
  columns: TableColumn[]
  rows: TableRow[]
} {
  const rows: TableRow[] = queue.rows.map((row) => ({
    kind: "data" as const,
    cells: [
      row.documentNo,
      row.customerName,
      formatDate(row.date),
      formatDate(row.lastDeliveryAt),
      String(row.ageDays),
      formatCurrency(row.deliveredValue),
      formatCurrency(row.billedValue),
      formatCurrency(row.unbilledValue),
    ],
  }))

  if (rows.length === 0) {
    rows.push({ kind: "notice", text: DELIVERED_UNBILLED_EMPTY_TEXT })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: `Jumlah (${queue.totalDocuments} pesanan penjualan)`,
      cells: [
        "",
        "",
        "",
        "",
        "",
        formatCurrency(queue.totalDeliveredValue),
        formatCurrency(queue.totalBilledValue),
        formatCurrency(queue.totalUnbilledValue),
      ],
    })
  }

  return { columns: COLUMNS, rows }
}
