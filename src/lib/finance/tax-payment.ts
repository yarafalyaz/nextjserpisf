/**
 * Penyetoran pajak (PPh) — logika murni: entri jurnal + laporan daftar.
 *
 * Satu hal yang menentukan di sini: **menyetor pajak bukan beban baru**. Yang
 * terjadi adalah utang pajak (yang sudah dipotong saat membayar vendor) berubah
 * menjadi kas keluar. Karena itu jurnalnya **Dr akun utang pajak, Cr kas/bank** —
 * bukan Dr beban pajak. Salah di sini akan menggandakan beban pajak.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { buildMoneyListing } from "@/lib/finance/money-listing"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface TaxPaymentEntry {
  accountId: number
  debit: number
  credit: number
  memo: string
}

export function buildTaxPaymentJournalEntries(input: {
  amount: number
  taxAccountId: number
  paymentAccountId: number
  label: string
  documentNo: string
}): TaxPaymentEntry[] {
  const { amount, taxAccountId, paymentAccountId, label, documentNo } = input
  return [
    {
      accountId: taxAccountId,
      debit: amount,
      credit: 0,
      memo: `Penyetoran ${label} ${documentNo}`,
    },
    {
      accountId: paymentAccountId,
      debit: 0,
      credit: amount,
      memo: `Kas/bank keluar untuk penyetoran ${label} ${documentNo}`,
    },
  ]
}

const COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 26 },
  { header: "No. Dokumen", align: "left", width: 38 },
  { header: "Masa", align: "left", width: 22 },
  { header: "Jenis", align: "left", width: 52 },
  { header: "SSP / MPN", align: "left", width: 44 },
  { header: "Jumlah", align: "right", width: 42 },
]

export interface TaxPaymentReportLine {
  date: Date
  documentNo: string
  period: string | null
  typeLabel: string
  reference: string | null
  amount: number
}

export interface TaxPaymentReportResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: { count: number; amount: number }
  verdict: string
}

export function buildTaxPaymentListing(lines: TaxPaymentReportLine[]): TaxPaymentReportResult {
  return buildMoneyListing({
    lines,
    columns: COLUMNS,
    cells: (line) => [
      line.date.toLocaleDateString("id-ID"),
      line.documentNo,
      line.period ?? "—",
      line.typeLabel,
      line.reference ?? "—",
      formatAccounting(line.amount, { zeroDash: false }),
    ],
    emptyNotice: "Tidak ada penyetoran pajak pada periode ini.",
    verdictNotice:
      "Penyetoran melunasi utang pajak yang sudah dipotong (jurnal: Dr utang pajak, Cr kas/bank), " +
      "bukan menambah beban pajak.",
    emptyVerdict: "Tidak ada penyetoran pajak pada periode ini",
    verdict: (count, amount) => `${count} penyetoran · total ${formatCurrency(amount)}`,
    totalCells: (count, amount) => [String(count), "", "", "", "", formatAccounting(amount, { zeroDash: false })],
  })
}

export function taxPaymentSummary(result: TaxPaymentReportResult): string {
  if (result.totals.count === 0) return "Tidak ada penyetoran pajak pada periode ini"
  return `${result.totals.count} penyetoran · total ${formatCurrency(result.totals.amount)}`
}
