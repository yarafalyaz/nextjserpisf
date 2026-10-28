/**
 * Tukar faktur — logika murni untuk daftar & laporan penagihan.
 *
 * Dua hal yang dijaga:
 *
 * - **Tanpa jurnal.** Tukar faktur hanya mencatat penyerahan faktur + tanda terima;
 *   piutangnya sudah tercatat oleh faktur itu sendiri. Membuat jurnal di sini akan
 *   menggandakan piutang.
 * - **Status pelunasan dihitung dari faktur**, bukan disimpan: `Dibayar` = Σ
 *   `SalesInvoice.paidAmount` dari faktur yang diserahkan. Jadi statusnya selalu
 *   mengikuti pembayaran terbaru, tidak bisa "basi".
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { isSettled } from "@/lib/finance/settlement-status"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export type SettlementStatus = "settled" | "partial" | "outstanding"

export const SETTLEMENT_LABEL: Record<SettlementStatus, string> = {
  settled: "Lunas",
  partial: "Sebagian",
  outstanding: "Belum Dibayar",
}

/**
 * Status pelunasan WAJIB memakai satu sumber kebenaran: FIN-BR-006
 * (`@/lib/finance/settlement-status`, toleransi `SETTLEMENT_TOLERANCE_IDR` = Rp1).
 *
 * Sebelum paritas ini berkas menyimpan ambangnya sendiri (setengah sen, 0,005),
 * sehingga satu faktur yang sudah "Lunas" di layar faktur/aging tampil
 * "Sebagian" di daftar & laporan tukar faktur — dua status untuk dokumen yang
 * sama, dan hitungan "lunas" laporan tidak bisa dicocokkan dengan AR.
 */
export function settlementStatus(amount: number, paid: number): SettlementStatus {
  if (isSettled(amount, paid)) return "settled"
  if (Number(paid ?? 0) > 0) return "partial"
  return "outstanding"
}

const COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 22 },
  { header: "No. Dokumen", align: "left", width: 34 },
  { header: "Pelanggan", align: "left", width: 44 },
  { header: "Tanda Terima", align: "left", width: 28 },
  { header: "Jatuh Tempo", align: "left", width: 24 },
  { header: "Faktur", align: "right", width: 14 },
  { header: "Nilai", align: "right", width: 28 },
  { header: "Dibayar", align: "right", width: 28 },
  { header: "Sisa", align: "right", width: 26 },
  { header: "Status", align: "left", width: 18 },
]

export interface ExchangeReportLine {
  date: Date
  documentNo: string
  customerName: string
  receiptNumber: string | null
  dueDate: Date | null
  invoiceCount: number
  amount: number
  paid: number
}

export interface ExchangeReportResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: { count: number; amount: number; paid: number; outstanding: number; settled: number; partial: number; outstandingDocs: number }
  verdict: string
}

export function buildInvoiceExchangeListing(lines: ExchangeReportLine[]): ExchangeReportResult {
  const sorted = [...lines].sort((a, b) => {
    const byDate = b.date.getTime() - a.date.getTime()
    return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
  })

  const totals: ExchangeReportResult["totals"] = {
    count: sorted.length,
    amount: 0,
    paid: 0,
    outstanding: 0,
    settled: 0,
    partial: 0,
    outstandingDocs: 0,
  }

  const rows: TableRow[] = sorted.map((line) => {
    const status = settlementStatus(line.amount, line.paid)
    totals.amount = safeAdd(totals.amount, line.amount, 2)
    totals.paid = safeAdd(totals.paid, line.paid, 2)
    totals.outstanding = safeAdd(totals.outstanding, safeSubtract(line.amount, line.paid, 2), 2)
    if (status === "settled") totals.settled += 1
    else if (status === "partial") totals.partial += 1
    else totals.outstandingDocs += 1

    return {
      kind: "data",
      cells: [
        line.date.toLocaleDateString("id-ID"),
        line.documentNo,
        line.customerName,
        line.receiptNumber ?? "—",
        line.dueDate ? line.dueDate.toLocaleDateString("id-ID") : "—",
        String(line.invoiceCount),
        formatAccounting(line.amount, { zeroDash: false }),
        formatAccounting(line.paid, { zeroDash: false }),
        formatAccounting(safeSubtract(line.amount, line.paid, 2), { zeroDash: false }),
        SETTLEMENT_LABEL[status],
      ],
    }
  })

  if (sorted.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada tukar faktur pada periode ini." })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [
        String(totals.count),
        "",
        "",
        "",
        "",
        "",
        formatAccounting(totals.amount, { zeroDash: false }),
        formatAccounting(totals.paid, { zeroDash: false }),
        formatAccounting(totals.outstanding, { zeroDash: false }),
        "",
      ],
    })
  }

  rows.push({
    kind: "notice",
    text:
      "Status pelunasan dihitung dari pembayaran tiap faktur (SalesInvoice.paidAmount), bukan disimpan di dokumen ini. " +
      "Tukar faktur tidak membuat jurnal — piutang sudah tercatat oleh fakturnya.",
  })

  const verdict =
    sorted.length === 0
      ? "Tidak ada tukar faktur pada periode ini"
      : `${sorted.length} penyerahan · ditagih ${formatCurrency(totals.amount)} · ` +
        `dibayar ${formatCurrency(totals.paid)} · sisa ${formatCurrency(totals.outstanding)}`

  return { table: { columns: COLUMNS, rows }, totals, verdict }
}

export function invoiceExchangeSummary(result: ExchangeReportResult): string {
  if (result.totals.count === 0) return "Tidak ada tukar faktur pada periode ini"
  return (
    `${result.totals.count} penyerahan · ${result.totals.settled} lunas · ${result.totals.partial} sebagian · ` +
    `${result.totals.outstandingDocs} belum dibayar · sisa ${formatCurrency(result.totals.outstanding)}`
  )
}
