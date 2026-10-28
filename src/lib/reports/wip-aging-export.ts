/** Loader + tabel PDF laporan Umur WIP (F-2026-10-20-72, tahap frontend).
 *
 * Snapshot per tanggal akhir periode: order produksi berjalan pada `asOf`,
 * sisa WIP = totalActualCost − releasedCost (builder murni `wip-aging.ts`).
 * Saldo GL akun WIP sengaja tidak dibandingkan di sini — saldo GL memuat
 * jurnal WIP jalur lain; halaman menampilkannya sebagai pembanding terpisah
 * bila tersedia, bukan syarat laporan.
 */
import { getWipAging } from "@/lib/reports/wip-aging-data"
import type { WipAging } from "@/lib/reports/wip-aging"
import { formatAccounting, formatDate, formatNumber } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import type { TableDocument } from "@/lib/pdf/engine/types"

export interface WipAgingLoadResult {
  report: WipAging
  periodCaption: string
  asOf: Date
}

export async function loadWipAgingReport(period: {
  start: Date
  end: Date
}): Promise<WipAgingLoadResult> {
  const asOf = period.end
  return {
    report: await getWipAging(asOf),
    periodCaption: `Per ${formatDate(asOf)}`,
    asOf,
  }
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function bucketLabel(report: WipAging, id: string): string {
  return report.buckets.find((bucket) => bucket.id === id)?.label ?? id
}

export function buildWipAgingTable(result: WipAgingLoadResult): TableDocument["table"] {
  const { report } = result
  const columns: TableDocument["table"]["columns"] = [
    { header: "No. Order", align: "left", width: 30 },
    { header: "Produk", align: "left", width: 38 },
    { header: "Perintah Kerja", align: "left", width: 30 },
    { header: "Status", align: "left", width: 24 },
    { header: "Umur (hari)", align: "right", width: 20 },
    { header: "Ember Umur", align: "left", width: 24 },
    { header: "Selesai (%)", align: "right", width: 22 },
    { header: "Sisa WIP", align: "right", width: 30 },
  ]

  if (report.totalOrders === 0) {
    return {
      columns,
      rows: [
        {
          kind: "notice",
          text: "Belum ada order produksi berjalan — tidak ada sisa WIP yang menahan biaya pada tanggal acuan ini.",
        },
      ],
    }
  }

  const rows: TableDocument["table"]["rows"] = [
    { kind: "group", label: "Ringkasan Umur WIP" },
    ...report.buckets.map((bucket) => ({
      kind: "data" as const,
      cells: [
        bucket.label,
        "",
        "",
        "",
        bucket.orderCount === 0 ? "" : formatNumber(bucket.orderCount),
        "",
        "",
        amount(bucket.wipAmount),
      ],
    })),
    { kind: "group", label: "Order Produksi Berjalan" },
    ...report.orders.map((order) => ({
      kind: "data" as const,
      cells: [
        order.documentNo,
        order.productName,
        order.workOrderDocumentNo ?? "–",
        statusLabel(order.status),
        formatNumber(order.ageDays),
        bucketLabel(report, order.bucket),
        `${formatNumber(order.completionPercent, 2)}%`,
        amount(order.wipAmount),
      ],
    })),
    {
      kind: "total",
      grand: true,
      label: "Jumlah Sisa WIP",
      cells: ["", "", "", "", formatNumber(report.totalOrders), "", "", amount(report.totalWipAmount)],
    },
    {
      kind: "notice",
      text:
        "Sisa WIP per order = total biaya aktual − biaya yang sudah dirilis ke persediaan barang jadi " +
        "(dijepit minimal 0). Umur dihitung dari tanggal mulai order (jatuh ke tanggal buat bila kosong) " +
        "sampai tanggal acuan. Total laporan adalah jumlah sisa WIP order berjalan; selisih terhadap saldo " +
        "GL akun WIP bukan galat — saldo GL juga memuat jurnal WIP dari jalur lain.",
    },
  ]

  return { columns, rows }
}
