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
  const sorted = [...lines].sort((a, b) => {
    const byDate = b.date.getTime() - a.date.getTime()
    return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
  })

  let amount = 0
  const rows: TableRow[] = sorted.map((line) => {
    amount += line.amount
    return {
      kind: "data",
      cells: [
        line.date.toLocaleDateString("id-ID"),
        line.documentNo,
        line.vendorName,
        line.description ?? "—",
        formatAccounting(line.amount, { zeroDash: false }),
      ],
    }
  })

  if (sorted.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada uang muka pembelian pada periode ini." })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [String(sorted.length), "", "", "", formatAccounting(amount, { zeroDash: false })],
    })
  }

  rows.push({
    kind: "notice",
    text:
      "Angka ini adalah uang muka yang **dibayarkan** pada periode, bukan saldo yang belum terpakai — " +
      "penerapan uang muka ke tagihan vendor belum diotomatiskan.",
  })

  return {
    table: { columns: COLUMNS, rows },
    totals: { count: sorted.length, amount },
    verdict:
      sorted.length === 0
        ? "Tidak ada uang muka pembelian pada periode ini"
        : `${sorted.length} uang muka · total dibayar ${formatCurrency(amount)}`,
  }
}

export function advanceListingSummary(result: AdvanceReportResult): string {
  if (result.totals.count === 0) return "Tidak ada uang muka pembelian pada periode ini"
  return `${result.totals.count} uang muka · total dibayar ${formatCurrency(result.totals.amount)}`
}
