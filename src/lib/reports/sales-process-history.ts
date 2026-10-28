/**
 * Histori proses penjualan — rantai dokumen per pesanan penjualan:
 * pesanan → surat jalan → faktur → pembayaran.
 *
 * Tujuannya menjawab "sampai mana pesanan ini berjalan", jadi yang ditonjolkan
 * adalah **jumlah dokumen di tiap tahap** dan **nilai yang sudah ditagih/dibayar**,
 * bukan rincian tiap dokumen (itu ada di halaman modulnya).
 *
 * Peringatan yang dijaga: pesanan yang sudah terkirim tetapi belum difakturkan, dan
 * faktur yang belum dibayar penuh — dua keadaan yang paling sering "hilang" di
 * antara modul.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { isOutstandingSettled } from "@/lib/finance/settlement-status"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 260mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "No. Pesanan", align: "left", width: 36 },
  { header: "Tanggal", align: "left", width: 22 },
  { header: "Pelanggan", align: "left", width: 46 },
  { header: "Surat Jalan", align: "right", width: 20 },
  { header: "Faktur", align: "right", width: 18 },
  { header: "Ditagih", align: "right", width: 34 },
  { header: "Dibayar", align: "right", width: 34 },
  { header: "Sisa", align: "right", width: 30 },
  { header: "Status", align: "left", width: 20 },
]

export interface SalesProcessLine {
  orderNo: string
  date: Date
  customerName: string
  status: string
  deliveryCount: number
  invoiceCount: number
  invoiced: number
  paid: number
}

export interface SalesProcessResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: {
    orders: number
    invoiced: number
    paid: number
    outstanding: number
    /** Pesanan dengan surat jalan tetapi belum ada faktur. */
    deliveredNotInvoiced: number
    /** Pesanan dengan faktur yang belum lunas. */
    invoicedUnpaid: number
  }
  verdict: string
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

export function buildSalesProcessHistory(lines: SalesProcessLine[]): SalesProcessResult {
  const sorted = [...lines].sort((a, b) => {
    const byDate = b.date.getTime() - a.date.getTime()
    return byDate !== 0 ? byDate : a.orderNo.localeCompare(b.orderNo, "id-ID")
  })

  const totals: SalesProcessResult["totals"] = {
    orders: sorted.length,
    invoiced: 0,
    paid: 0,
    outstanding: 0,
    deliveredNotInvoiced: 0,
    invoicedUnpaid: 0,
  }

  const rows: TableRow[] = sorted.map((line) => {
    const outstanding = safeSubtract(line.invoiced, line.paid, 2)
    totals.invoiced = safeAdd(totals.invoiced, line.invoiced, 2)
    totals.paid = safeAdd(totals.paid, line.paid, 2)
    totals.outstanding = safeAdd(totals.outstanding, outstanding, 2)
    if (line.deliveryCount > 0 && line.invoiceCount === 0) totals.deliveredNotInvoiced += 1
    // FIN-BR-006: penghitung "belum dibayar" memakai SATU ambang lunas Rp1
    // (isOutstandingSettled) dengan layar dokumen — sisa <= Rp1 = lunas.
    if (line.invoiceCount > 0 && !isOutstandingSettled(outstanding)) totals.invoicedUnpaid += 1

    return {
      kind: "data",
      cells: [
        line.orderNo,
        shortDate(line.date),
        line.customerName,
        String(line.deliveryCount),
        String(line.invoiceCount),
        amount(line.invoiced),
        amount(line.paid),
        amount(outstanding),
        line.status,
      ],
    }
  })

  if (sorted.length === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada pesanan penjualan pada periode ini.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: ["", "", "", "", "", amount(totals.invoiced), amount(totals.paid), amount(totals.outstanding), ""],
    })
  }

  if (totals.deliveredNotInvoiced > 0) {
    rows.push({
      kind: "notice",
      text:
        `${totals.deliveredNotInvoiced} pesanan sudah dikirim (ada surat jalan) tetapi belum difakturkan. ` +
        "Periksa apakah faktur memang belum dibuat atau tertinggal.",
    })
  }
  if (totals.invoicedUnpaid > 0) {
    rows.push({
      kind: "notice",
      text: `${totals.invoicedUnpaid} pesanan sudah difakturkan tetapi belum dibayar penuh.`,
    })
  }

  const verdict =
    sorted.length === 0
      ? "Tidak ada pesanan penjualan pada periode ini"
      : `${sorted.length} pesanan · ditagih ${formatCurrency(totals.invoiced)} · ` +
        `dibayar ${formatCurrency(totals.paid)} · sisa ${formatCurrency(totals.outstanding)}`

  return { table: { columns: COLUMNS, rows }, totals, verdict }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function salesProcessSummary(result: SalesProcessResult): string {
  if (result.totals.orders === 0) return "Tidak ada pesanan penjualan pada periode ini"
  return (
    `${result.totals.orders} pesanan · ditagih ${formatCurrency(result.totals.invoiced)} · ` +
    `dibayar ${formatCurrency(result.totals.paid)} · sisa ${formatCurrency(result.totals.outstanding)}`
  )
}
