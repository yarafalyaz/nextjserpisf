/**
 * Model tabel untuk laporan keuangan bergaya statement (Neraca, Laba Rugi).
 *
 * Satu model dipakai DUA renderer: JSX di halaman (`StatementTableView`) dan
 * engine PDF server-side (`renderStatementPdf`). Sebelumnya PDF laporan dibuat
 * dengan membaca DOM (`document.querySelectorAll('[data-report-table]')` +
 * `innerText`), sehingga isi PDF hanya benar selama markup layar kebetulan
 * identik dengan yang diinginkan kertas — dan setiap perubahan tampilan bisa
 * diam-diam mengubah cetakan. Dengan model ini keduanya tidak mungkin berbeda:
 * urutan kelompok, label subtotal, dan format angkanya hanya ditulis sekali.
 *
 * Pure (tanpa Prisma/DOM) supaya bisa diuji tanpa database.
 */

import { formatAccounting } from "@/lib/utils/format"
import type { StatementRow } from "@/lib/reports/statement-display"
import type { IncomeStatementResult } from "@/lib/finance/income-statement"

export type StatementAlign = "left" | "right" | "center"

export interface StatementColumn {
  header: string
  align: StatementAlign
}

export type StatementTableRow =
  /** Judul kelompok, mis. "ASET" — membentang seluruh kolom. */
  | { kind: "group"; label: string }
  /** Baris akun: kode + nama (terindentasi) + kolom nilai. */
  | {
      kind: "line"
      id: number
      code: string
      name: string
      level: number
      hasChildren: boolean
      values: string[]
    }
  /** Subtotal per kelompok — garis tipis di atas. */
  | { kind: "subtotal"; label: string; values: string[]; indent?: number }
  /** Hasil antara yang dihitung dari subtotal, mis. "Laba Kotor". */
  | { kind: "total"; label: string; values: string[] }
  /** Baris terakhir laporan, mis. "Laba Bersih" — garis ganda di atas. */
  | { kind: "grand"; label: string; values: string[] }
  /** Catatan/peringatan di bawah tabel (mis. neraca tidak seimbang). */
  | { kind: "notice"; text: string }

export interface StatementTable {
  columns: StatementColumn[]
  rows: StatementTableRow[]
}

/** Format angka statement: ribuan bertitik, nol sebagai "0" (bukan "–"). */
export function statementAmount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function lineRows(rows: StatementRow[], negative = false): StatementTableRow[] {
  return rows.map((row) => ({
    kind: "line",
    id: row.id,
    code: row.code,
    name: row.name,
    level: row.level,
    hasChildren: row.hasChildren,
    values: [statementAmount(negative ? -row.balance : row.balance)],
  }))
}

export interface BalanceSheetTableInput {
  asOfLabel: string
  assetRows: StatementRow[]
  liabilityRows: StatementRow[]
  equityRows: StatementRow[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  isBalanced: boolean
}

/**
 * Susunan Neraca: Aset → Kewajiban → Ekuitas, ditutup "Total Kewajiban dan
 * Ekuitas". Bila identitas akuntansi tidak menutup, tabel ditutup baris
 * peringatan berisi nominal selisihnya — laporan harus menyebutkan selisihnya,
 * bukan menampilkan angka yang kebetulan seimbang.
 */
export function buildBalanceSheetTable(input: BalanceSheetTableInput): StatementTable {
  const totalLiabilitiesAndEquity = input.totalLiabilities + input.totalEquity

  const rows: StatementTableRow[] = [
    { kind: "group", label: "Aset" },
    ...lineRows(input.assetRows),
    { kind: "subtotal", label: "Jumlah Aset", values: [statementAmount(input.totalAssets)] },
    { kind: "group", label: "Kewajiban" },
    ...lineRows(input.liabilityRows),
    { kind: "subtotal", label: "Jumlah Kewajiban", values: [statementAmount(input.totalLiabilities)] },
    { kind: "group", label: "Ekuitas" },
    ...lineRows(input.equityRows),
    { kind: "subtotal", label: "Jumlah Ekuitas", values: [statementAmount(input.totalEquity)] },
    {
      kind: "grand",
      label: "Total Kewajiban dan Ekuitas",
      values: [statementAmount(totalLiabilitiesAndEquity)],
    },
  ]

  if (!input.isBalanced) {
    rows.push({
      kind: "notice",
      text:
        `Perhatian: Jumlah Aset (${statementAmount(input.totalAssets)}) tidak sama dengan ` +
        `Total Kewajiban dan Ekuitas (${statementAmount(totalLiabilitiesAndEquity)}) — ` +
        `selisih ${statementAmount(input.totalAssets - totalLiabilitiesAndEquity)}.`,
    })
  }

  return {
    columns: [
      { header: "Kode", align: "left" },
      { header: "Deskripsi", align: "left" },
      { header: "Nilai (IDR)", align: "right" },
    ],
    rows,
  }
}

export interface IncomeStatementTableInput {
  columnLabel: string
  showPercent: boolean
  revenueRows: StatementRow[]
  cogsRows: StatementRow[]
  operatingExpenseRows: StatementRow[]
  otherIncomeRows: StatementRow[]
  otherExpenseRows: StatementRow[]
  result: IncomeStatementResult
}

/**
 * Susunan Laba Rugi multi tahap: Pendapatan → HPP → Laba Kotor → Beban
 * Operasional → Pendapatan Operasional → Non Operasional → Laba Bersih.
 *
 * Kelompok HPP dan Non Operasional hanya muncul bila memang ada isinya, seperti
 * pada halaman laporan.
 */
export function buildIncomeStatementTable(input: IncomeStatementTableInput): StatementTable {
  const { result, showPercent } = input
  const percentOf = (value: number) =>
    result.totalRevenue !== 0 ? (value / result.totalRevenue) * 100 : 0

  const values = (value: number) =>
    showPercent ? [statementAmount(value), `${percentOf(value).toFixed(1)}%`] : [statementAmount(value)]

  const lines = (rows: StatementRow[], negative = false) =>
    rows.map((row) => ({
      kind: "line" as const,
      id: row.id,
      code: row.code,
      name: row.name,
      level: row.level,
      hasChildren: row.hasChildren,
      values: showPercent
        ? [
            statementAmount(negative ? -row.balance : row.balance),
            `${percentOf(row.balance).toFixed(1)}%`,
          ]
        : [statementAmount(negative ? -row.balance : row.balance)],
    }))

  const hasCogs = result.totalCogs !== 0 || input.cogsRows.length > 0
  const hasOther =
    result.totalOtherIncome !== 0 ||
    result.totalOtherExpense !== 0 ||
    input.otherIncomeRows.length > 0 ||
    input.otherExpenseRows.length > 0

  const rows: StatementTableRow[] = [
    { kind: "group", label: "Pendapatan" },
    ...lines(input.revenueRows),
    { kind: "subtotal", label: "Jumlah Pendapatan", values: values(result.totalRevenue) },
  ]

  if (hasCogs) {
    rows.push(
      { kind: "group", label: "Beban Pokok Penjualan" },
      ...lines(input.cogsRows),
      { kind: "subtotal", label: "Jumlah Beban Pokok Penjualan", values: values(result.totalCogs) },
    )
  }

  rows.push(
    { kind: "total", label: "Laba Kotor", values: values(result.grossProfit) },
    { kind: "group", label: "Beban Operasional" },
    ...lines(input.operatingExpenseRows),
    { kind: "subtotal", label: "Jumlah Beban Operasional", values: values(result.totalExpense) },
    { kind: "total", label: "Pendapatan Operasional", values: values(result.operatingProfit) },
  )

  if (hasOther) {
    rows.push(
      { kind: "group", label: "Pendapatan dan Beban Non Operasional" },
      { kind: "subtotal", label: "Pendapatan Non Operasional", indent: 1, values: values(result.totalOtherIncome) },
      ...lines(input.otherIncomeRows),
      { kind: "subtotal", label: "Jumlah Pendapatan Non Operasional", values: values(result.totalOtherIncome) },
      { kind: "subtotal", label: "Beban Non Operasional", indent: 1, values: values(result.totalOtherExpense) },
      // Beban non-operasional tampil sebagai angka negatif, seperti di layar.
      ...lines(input.otherExpenseRows, true),
      { kind: "subtotal", label: "Jumlah Beban Non Operasional", values: values(result.totalOtherExpense) },
      { kind: "subtotal", label: "Jumlah Pendapatan dan Beban Non Operasional", values: values(result.totalOther) },
    )
  }

  rows.push({ kind: "grand", label: "Laba Bersih", values: values(result.netProfit) })

  return {
    columns: [
      { header: "Kode", align: "left" },
      { header: "Deskripsi", align: "left" },
      { header: "Nilai (IDR)", align: "right" },
      ...(showPercent ? [{ header: "%", align: "right" as StatementAlign }] : []),
    ],
    rows,
  }
}
