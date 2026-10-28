/**
 * Histori proses pembelian — rantai dokumen per pesanan pembelian:
 * permintaan → pesanan → penerimaan → tagihan → pembayaran.
 *
 * Sama seperti versi penjualan: yang ditonjolkan adalah **jumlah dokumen per tahap**
 * dan **nilai yang sudah ditagih/dibayar**. Nilai ditagih = Σ `VendorBill.grandTotal`,
 * dibayar = Σ `VendorBill.paidAmount` (angka yang sama dipakai modul utang).
 *
 * Peringatan yang dijaga: pesanan yang sudah diterima tetapi belum ditagih (hutang
 * belum tercatat) dan tagihan yang belum lunas.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { isOutstandingSettled } from "@/lib/finance/settlement-status"
import { formatAccounting, formatCurrency, formatDate } from "@/lib/utils/format"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 260mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "No. Pesanan", align: "left", width: 36 },
  { header: "Tanggal", align: "left", width: 22 },
  { header: "Pemasok", align: "left", width: 46 },
  { header: "Permintaan", align: "left", width: 22 },
  { header: "Terima", align: "right", width: 18 },
  { header: "Tagihan", align: "right", width: 18 },
  { header: "Ditagih", align: "right", width: 34 },
  { header: "Dibayar", align: "right", width: 34 },
  { header: "Sisa", align: "right", width: 30 },
]

export interface PurchaseProcessLine {
  orderNo: string
  date: Date
  vendorName: string
  status: string
  requestNo: string | null
  receiptCount: number
  billCount: number
  billed: number
  paid: number
}

export interface PurchaseProcessResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: {
    orders: number
    billed: number
    paid: number
    outstanding: number
    /** Pesanan dengan penerimaan tetapi belum ada tagihan. */
    receivedNotBilled: number
    /** Pesanan dengan tagihan yang belum lunas. */
    billedUnpaid: number
  }
  verdict: string
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

export function buildPurchaseProcessHistory(lines: PurchaseProcessLine[]): PurchaseProcessResult {
  const sorted = [...lines].sort((a, b) => {
    const byDate = b.date.getTime() - a.date.getTime()
    return byDate !== 0 ? byDate : a.orderNo.localeCompare(b.orderNo, "id-ID")
  })

  const totals: PurchaseProcessResult["totals"] = {
    orders: sorted.length,
    billed: 0,
    paid: 0,
    outstanding: 0,
    receivedNotBilled: 0,
    billedUnpaid: 0,
  }

  const rows: TableRow[] = sorted.map((line) => {
    const outstanding = safeSubtract(line.billed, line.paid, 2)
    totals.billed = safeAdd(totals.billed, line.billed, 2)
    totals.paid = safeAdd(totals.paid, line.paid, 2)
    totals.outstanding = safeAdd(totals.outstanding, outstanding, 2)
    if (line.receiptCount > 0 && line.billCount === 0) totals.receivedNotBilled += 1
    // FIN-BR-006: penghitung "belum dibayar" memakai SATU ambang lunas Rp1
    // (isOutstandingSettled) dengan layar dokumen — sisa <= Rp1 = lunas.
    if (line.billCount > 0 && !isOutstandingSettled(outstanding)) totals.billedUnpaid += 1

    return {
      kind: "data",
      cells: [
        line.orderNo,
        shortDate(line.date),
        line.vendorName,
        line.requestNo ?? "—",
        String(line.receiptCount),
        String(line.billCount),
        amount(line.billed),
        amount(line.paid),
        amount(outstanding),
      ],
    }
  })

  if (sorted.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada pesanan pembelian pada periode ini." })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: ["", "", "", "", "", "", amount(totals.billed), amount(totals.paid), amount(totals.outstanding)],
    })
  }

  if (totals.receivedNotBilled > 0) {
    rows.push({
      kind: "notice",
      text:
        `${totals.receivedNotBilled} pesanan sudah diterima barangnya tetapi belum ditagih. ` +
        "Hutangnya belum tercatat sampai tagihan dibuat.",
    })
  }
  if (totals.billedUnpaid > 0) {
    rows.push({
      kind: "notice",
      text: `${totals.billedUnpaid} pesanan sudah ditagih tetapi belum dibayar penuh.`,
    })
  }

  const verdict =
    sorted.length === 0
      ? "Tidak ada pesanan pembelian pada periode ini"
      : `${sorted.length} pesanan · ditagih ${formatCurrency(totals.billed)} · ` +
        `dibayar ${formatCurrency(totals.paid)} · sisa ${formatCurrency(totals.outstanding)}`

  return { table: { columns: COLUMNS, rows }, totals, verdict }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function purchaseProcessSummary(result: PurchaseProcessResult): string {
  if (result.totals.orders === 0) return "Tidak ada pesanan pembelian pada periode ini"
  return (
    `${result.totals.orders} pesanan · ditagih ${formatCurrency(result.totals.billed)} · ` +
    `dibayar ${formatCurrency(result.totals.paid)} · sisa ${formatCurrency(result.totals.outstanding)}`
  )
}
