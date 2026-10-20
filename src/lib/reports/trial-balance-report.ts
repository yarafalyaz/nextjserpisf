/**
 * Tabel Neraca Saldo (trial balance) — Kode | Nama Akun | Debit | Kredit, dengan
 * baris Total dan peringatan bila debit ≠ kredit.
 *
 * Bila parameter "pembanding" dipakai, kolom saldo bersih periode ini dan periode
 * pembanding ditambahkan ke TABEL YANG SAMA, seperti neraca saldo komparatif di
 * sistem akuntansi lain (Accurate/NetSuite/Odoo mencetak perbandingan sebagai
 * kolom, bukan tabel terpisah di bawahnya). Satu tabel juga membuat tampilan
 * layar dan PDF tidak mungkin berbeda.
 *
 * Pure (tanpa Prisma/DOM) supaya aturan kolom dan totalnya bisa diuji.
 */

import { formatAccounting } from "@/lib/utils/format"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"
import type { TrialBalanceLine } from "@/lib/finance/trial-balance"

/** Lebar kolom (mm) — A4 tegak (area isi 180mm). */
const BASE_COLUMNS: TableColumn[] = [
  { header: "Kode", align: "left", width: 18 },
  { header: "Nama Akun", align: "left", width: 82 },
  { header: "Debit", align: "right", width: 40 },
  { header: "Kredit", align: "right", width: 40 },
]

export interface TrialBalanceComparisonRow {
  id: number
  code: string
  name: string
  /** Saldo bersih (debit − kredit) pada tanggal laporan. */
  net1: number
  /** Saldo bersih pada tanggal pembanding. */
  net2: number
}

export interface TrialBalanceReportInput {
  lines: TrialBalanceLine[]
  grandTotalDebit: number
  grandTotalCredit: number
  isBalanced: boolean
  /** Tanggal posisi, mis. "31 Oktober 2026". */
  asOfLabel: string
  comparison?: {
    rows: TrialBalanceComparisonRow[]
    /** Label tanggal pembanding, mis. "30 September 2026". */
    label: string
  } | null
}

export interface TrialBalanceReportResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  /** Lembar mendatar dipakai bila ada kolom pembanding (7 kolom). */
  landscape: boolean
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

export function buildTrialBalanceReport(input: TrialBalanceReportInput): TrialBalanceReportResult {
  const comparison = input.comparison ?? null

  if (comparison) {
    const columns: TableColumn[] = [
      { header: "Kode", align: "left", width: 18 },
      { header: "Nama Akun", align: "left", width: 62 },
      { header: `Per ${input.asOfLabel}`, align: "right", width: 34 },
      { header: `Per ${comparison.label}`, align: "right", width: 34 },
      { header: "Selisih", align: "right", width: 30 },
    ]

    let total1 = 0
    let total2 = 0
    const rows: TableRow[] = comparison.rows.map((row) => {
      total1 = safeAdd(total1, row.net1, 2)
      total2 = safeAdd(total2, row.net2, 2)
      return {
        kind: "data",
        cells: [row.code, row.name, amount(row.net1), amount(row.net2), amount(safeSubtract(row.net1, row.net2, 2))],
      }
    })

    if (rows.length === 0) {
      rows.push({ kind: "notice", text: "Tidak ada saldo pada kedua periode." })
    } else {
      rows.push({
        kind: "total",
        grand: true,
        label: "Total",
        cells: [amount(total1), amount(total2), amount(safeSubtract(total1, total2, 2))],
      })
    }

    return { table: { columns, rows }, landscape: true }
  }

  const rows: TableRow[] = input.lines.map((line) => ({
    kind: "data",
    cells: [
      line.code,
      line.name,
      // Akun yang hanya bergerak di satu sisi dibiarkan kosong di sisi lain,
      // seperti kebiasaan cetak neraca saldo (nol tidak ditulis).
      line.totalDebit ? amount(line.totalDebit) : "",
      line.totalCredit ? amount(line.totalCredit) : "",
    ],
  }))

  if (rows.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada data jurnal yang sudah diposting." })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Total",
      cells: [amount(input.grandTotalDebit), amount(input.grandTotalCredit)],
    })

    if (!input.isBalanced) {
      rows.push({
        kind: "notice",
        text:
          `Perhatian: total debit (${amount(input.grandTotalDebit)}) tidak sama dengan total kredit ` +
          `(${amount(input.grandTotalCredit)}) — selisih ${amount(safeSubtract(input.grandTotalDebit, input.grandTotalCredit, 2))}.`,
      })
    }
  }

  return { table: { columns: BASE_COLUMNS, rows }, landscape: false }
}
