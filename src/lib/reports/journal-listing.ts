/**
 * Daftar jurnal — mesin bersama untuk laporan yang menampilkan jurnal beserta
 * baris akunnya (Jurnal Aset Tetap, Rincian Jurnal Pekerjaan Pesanan).
 *
 * Sebelumnya bentuk ini hanya ada di laporan aset. Ketika laporan kedua
 * membutuhkannya, menyalin blok yang sama berarti dua tempat yang menghitung
 * "debit = kredit" — dan cukup satu di antaranya yang diperbaiki agar laporan
 * saling bertentangan. Karena itu pengelompokan, penjumlahan, dan pemeriksaan
 * saldo tinggal di sini; tiap laporan hanya memasok judul blok dan catatan
 * kosongnya.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatDate } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
export const JOURNAL_LISTING_COLUMNS: TableColumn[] = [
  { header: "Tanggal / No. Jurnal / Keterangan", align: "left", width: 105 },
  { header: "Akun", align: "left", width: 92 },
  { header: "Debit", align: "right", width: 35 },
  { header: "Kredit", align: "right", width: 35 },
]

export interface JournalListingLine {
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

export interface JournalListingInput {
  id: number
  journalNumber: string
  date: Date
  /** Judul blok, mis. "08 Okt 2026 · JU-0001 · Penyusutan · AST-001 Forklift". */
  title: string
  description: string | null
  lines: JournalListingLine[]
}

export interface JournalListingResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  journalCount: number
  totalDebit: number
  totalCredit: number
  /** Debit = kredit untuk seluruh jurnal yang ditampilkan. */
  isBalanced: boolean
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

export function shortJournalDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

/**
 * Satu blok per jurnal (kepala = `title`), baris akun diurutkan menaik, lalu baris
 * jumlah. Bila tidak ada jurnal sama sekali, tabel berisi satu baris catatan —
 * laporan kosong tanpa penjelasan selalu terbaca seperti bug.
 */
export function buildJournalListing(input: {
  journals: JournalListingInput[]
  emptyNotice: string
  /** Label baris jumlah; "Jumlah" untuk laporan jurnal. */
  totalLabel?: string
}): JournalListingResult {
  const { journals, emptyNotice, totalLabel = "Jumlah" } = input

  const sorted = [...journals].sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime()
    if (byDate !== 0) return byDate
    return String(a.journalNumber).localeCompare(String(b.journalNumber), "id-ID")
  })

  const rows: TableRow[] = []
  let totalDebit = 0
  let totalCredit = 0

  for (const journal of sorted) {
    const lines = [...journal.lines].sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode, "id-ID", { numeric: true }),
    )
    for (const line of lines) {
      totalDebit = safeAdd(totalDebit, line.debit, 2)
      totalCredit = safeAdd(totalCredit, line.credit, 2)
    }

    rows.push({ kind: "group", label: journal.title })
    if (journal.description) rows.push({ kind: "notice", text: journal.description })

    for (const line of lines) {
      rows.push({
        kind: "data",
        cells: ["", `${line.accountCode} ${line.accountName}`, amount(line.debit), amount(line.credit)],
      })
    }
  }

  if (sorted.length === 0) rows.push({ kind: "notice", text: emptyNotice })

  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005
  if (sorted.length > 0 && !isBalanced) {
    rows.push({
      kind: "notice",
      text:
        `Perhatian: total debit ${amount(totalDebit)} tidak sama dengan total kredit ${amount(totalCredit)} — ` +
        `selisih ${amount(totalDebit - totalCredit)}. Periksa jurnal yang barisnya tidak lengkap.`,
    })
  }

  if (sorted.length > 0) {
    rows.push({
      kind: "total",
      grand: true,
      label: totalLabel,
      cells: ["", "", amount(totalDebit), amount(totalCredit)],
    })
  }

  return {
    table: { columns: JOURNAL_LISTING_COLUMNS, rows },
    journalCount: sorted.length,
    totalDebit,
    totalCredit,
    isBalanced,
  }
}
