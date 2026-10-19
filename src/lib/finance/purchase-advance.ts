/**
 * Uang muka pembelian — logika murni (entri jurnal + laporan daftar).
 *
 * Dipisah dari aksi/halaman supaya bentuk jurnalnya bisa diuji tanpa DB: inilah
 * satu-satunya tempat yang menentukan "Dr apa, Cr apa", dan salah di sini berarti
 * kas/bank bertambah padahal uang keluar.
 *
 * **Batas yang disengaja:** jumlah uang muka = yang dibayarkan (bukan sisa yang
 * belum terpakai). Penerapan uang muka ke tagihan vendor belum ada di sistem, jadi
 * laporan menyebut angkanya sebagai "uang muka dibayar", bukan "saldo uang muka".
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { buildMoneyListing } from "@/lib/finance/money-listing"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface AdvanceJournalEntry {
  accountId: number
  debit: number
  credit: number
  memo: string
}

/**
 * Entri jurnal uang muka: **Dr Uang Muka (aset), Cr Kas/Bank**.
 *
 * Uang muka adalah aset (hak atas barang/jasa yang belum diterima), bukan beban —
 * jadi sisi debit masuk ke akun uang muka yang dipilih, bukan langsung ke beban.
 */
export function buildAdvanceJournalEntries(input: {
  amount: number
  advanceAccountId: number
  paymentAccountId: number
  vendorName: string
  documentNo: string
}): AdvanceJournalEntry[] {
  const { amount, advanceAccountId, paymentAccountId, vendorName, documentNo } = input
  return [
    {
      accountId: advanceAccountId,
      debit: amount,
      credit: 0,
      memo: `Uang muka pembelian ${documentNo} — ${vendorName}`,
    },
    {
      accountId: paymentAccountId,
      debit: 0,
      credit: amount,
      memo: `Pembayaran uang muka ${documentNo} — ${vendorName}`,
    },
  ]
}

const COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 26 },
  { header: "No. Dokumen", align: "left", width: 40 },
  { header: "Pemasok", align: "left", width: 66 },
  { header: "Keterangan", align: "left", width: 60 },
  { header: "Jumlah", align: "right", width: 40 },
]

export interface AdvanceReportLine {
  date: Date
  documentNo: string
  vendorName: string
  description: string | null
  amount: number
}

export interface AdvanceReportResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: { count: number; amount: number }
  verdict: string
}

export function buildAdvanceListing(lines: AdvanceReportLine[]): AdvanceReportResult {
  return buildMoneyListing({
    lines,
    columns: COLUMNS,
    cells: (line) => [
      line.date.toLocaleDateString("id-ID"),
      line.documentNo,
      line.vendorName,
      line.description ?? "—",
      formatAccounting(line.amount, { zeroDash: false }),
    ],
    emptyNotice: "Tidak ada uang muka pembelian pada periode ini.",
    verdictNotice:
      "Angka ini adalah uang muka yang **dibayarkan** pada periode, bukan saldo yang belum terpakai — " +
      "penerapan uang muka ke tagihan vendor belum diotomatiskan.",
    emptyVerdict: "Tidak ada uang muka pembelian pada periode ini",
    verdict: (count, amount) => `${count} uang muka · total dibayar ${formatCurrency(amount)}`,
    totalCells: (count, amount) => [String(count), "", "", "", formatAccounting(amount, { zeroDash: false })],
  })
}

export function advanceListingSummary(result: AdvanceReportResult): string {
  if (result.totals.count === 0) return "Tidak ada uang muka pembelian pada periode ini"
  return `${result.totals.count} uang muka · total dibayar ${formatCurrency(result.totals.amount)}`
}
