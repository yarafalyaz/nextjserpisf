/**
 * Period-over-period comparison for financial statements (Laba Rugi / Neraca).
 *
 * Pure by design (no Prisma) so the normal-balance conversion, variance and
 * percentage arithmetic can be unit tested.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"

export interface AccountBalance {
  id: number
  code: string
  name: string
  type: string
  balance: number
}

/** ASSET/EXPENSE are debit-normal, everything else credit-normal. */
function isDebitNormal(type: string): boolean {
  return type === "ASSET" || type === "EXPENSE"
}

/** Convert raw debit/credit sums into signed balances using the normal side. */
export function toAccountBalances(
  accounts: { id: number; code: string; name: string; type: string }[],
  sums: Map<number, { debit: number; credit: number }>,
): AccountBalance[] {
  return accounts.map((account) => {
    const sum = sums.get(account.id)
    const balance = !sum
      ? 0
      : isDebitNormal(account.type)
        ? safeSubtract(sum.debit, sum.credit, 2)
        : safeSubtract(sum.credit, sum.debit, 2)
    return { id: account.id, code: account.code, name: account.name, type: account.type, balance }
  })
}

export interface ComparisonRow {
  key: string
  code: string
  name: string
  type: string
  current: number
  previous: number
  variance: number
  /** Percentage change vs the previous period; null when previous = 0. */
  percentage: number | null
}

export interface ComparisonResult {
  rows: ComparisonRow[]
  totalCurrent: number
  totalPrevious: number
  totalVariance: number
}

/**
 * Compare two periods account by account. Accounts that are zero in BOTH periods
 * are dropped so the report stays readable.
 */
export function buildComparison(current: AccountBalance[], previous: AccountBalance[]): ComparisonResult {
  const previousById = new Map(previous.map((row) => [row.id, row.balance]))

  const rows: ComparisonRow[] = current
    .map((row) => {
      const previousBalance = previousById.get(row.id) ?? 0
      const variance = safeSubtract(row.balance, previousBalance, 2)
      const percentage = previousBalance !== 0 ? (variance / Math.abs(previousBalance)) * 100 : null
      return {
        key: String(row.id),
        code: row.code,
        name: row.name,
        type: row.type,
        current: row.balance,
        previous: previousBalance,
        variance,
        percentage,
      }
    })
    .filter((row) => row.current !== 0 || row.previous !== 0)

  const totalCurrent = rows.reduce((sum, row) => safeAdd(sum, row.current, 2), 0)
  const totalPrevious = rows.reduce((sum, row) => safeAdd(sum, row.previous, 2), 0)

  return { rows, totalCurrent, totalPrevious, totalVariance: safeSubtract(totalCurrent, totalPrevious, 2) }
}

/** The same-length window immediately before `start`, used as the default comparator. */
export function previousWindow(start: Date, end: Date): { start: Date; end: Date } {
  const lengthMs = Math.max(0, end.getTime() - start.getTime())
  const previousEnd = new Date(start.getTime() - 1)
  const previousStart = new Date(previousEnd.getTime() - lengthMs)
  return { start: previousStart, end: previousEnd }
}

/** Satu sisi neraca: satu blok (Aset/Kewajiban/Ekuitas) dengan totalnya. */
export interface BalanceComparisonSide {
  /** Nama blok; baris `Laba/Rugi Berjalan` sintetis, bukan akun. */
  label: string
  rows: ComparisonRow[]
  totalCurrent: number
  totalPrevious: number
  totalVariance: number
}

/** Saldo satu periode per kelompok tipe akun (hasil `toAccountBalances`). */
export interface BalanceComparisonInput {
  assets: AccountBalance[]
  liabilities: AccountBalance[]
  equity: AccountBalance[]
  revenue: AccountBalance[]
  expense: AccountBalance[]
}

export interface BalanceComparisonResult {
  assets: BalanceComparisonSide
  liabilities: BalanceComparisonSide
  equity: BalanceComparisonSide
  /** Laba berjalan = Pendapatan − Beban; masuk ekuitas (identitas neraca). */
  netIncomeCurrent: number
  netIncomePrevious: number
  /** `Aset = Kewajiban + Ekuitas` (laba berjalan sudah termasuk di ekuitas). */
  isBalanced: boolean
}

const NI_CODE = "NI"
const NI_NAME = "Laba/Rugi Berjalan"

/** Kelompokkan saldo hasil `toAccountBalances` per tipe untuk `buildBalanceComparison`. */
export function groupBalancesByType(balances: AccountBalance[]): BalanceComparisonInput {
  const bucket = (type: string) => balances.filter((row) => row.type === type)
  return {
    assets: bucket("ASSET"),
    liabilities: bucket("LIABILITY"),
    equity: bucket("EQUITY"),
    revenue: bucket("REVENUE"),
    expense: bucket("EXPENSE"),
  }
}

function makeRow(
  key: string,
  code: string,
  name: string,
  type: string,
  current: number,
  previous: number,
): ComparisonRow {
  const variance = safeSubtract(current, previous, 2)
  return {
    key,
    code,
    name,
    type,
    current,
    previous,
    variance,
    percentage: previous !== 0 ? (variance / Math.abs(previous)) * 100 : null,
  }
}

/** Baris per akun satu blok; akun nol di kedua periode dibuang. */
function sideRows(current: AccountBalance[], previous: AccountBalance[]): ComparisonRow[] {
  const previousById = new Map(previous.map((row) => [row.id, row.balance]))
  return current
    .map((row) => makeRow(String(row.id), row.code, row.name, row.type, row.balance, previousById.get(row.id) ?? 0))
    .filter((row) => row.current !== 0 || row.previous !== 0)
}

function totalOf(rows: ComparisonRow[]) {
  const totalCurrent = rows.reduce((sum, row) => safeAdd(sum, row.current, 2), 0)
  const totalPrevious = rows.reduce((sum, row) => safeAdd(sum, row.previous, 2), 0)
  return { totalCurrent, totalPrevious, totalVariance: safeSubtract(totalCurrent, totalPrevious, 2) }
}

function netIncomeOf(period: BalanceComparisonInput): number {
  return safeSubtract(
    period.revenue.reduce((sum, row) => safeAdd(sum, row.balance, 2), 0),
    period.expense.reduce((sum, row) => safeAdd(sum, row.balance, 2), 0),
    2,
  )
}

/**
 * Neraca perbandingan: blok Aset / Kewajiban / Ekuitas, masing-masing dengan
 * totalnya sendiri, plus baris sintetis `Laba/Rugi Berjalan` di ekuitas.
 *
 * Sebelum putaran 103 halaman memuat ASSET/LIABILITY/EQUITY lalu menjumlahkan
 * ketiganya menjadi satu KPI "Total Periode Ini" dan satu baris TOTAL tabel.
 * Itu bukan identitas neraca: laba berjalan (pendapatan − beban) hilang dari
 * sisi ekuitas sehingga neraca tak pernah seimbang, dan angka besar di kaki
 * tabel adalah aset + kewajiban + ekuitas yang tidak punya arti. Di sini tiap
 * sisi membawa totalnya sendiri dan `Aset = Kewajiban + Ekuitas` bertahan
 * karena laba berjalan disuntikkan — pola `computeBalanceSheet`.
 */
export function buildBalanceComparison(
  current: BalanceComparisonInput,
  previous: BalanceComparisonInput,
): BalanceComparisonResult {
  const netIncomeCurrent = netIncomeOf(current)
  const netIncomePrevious = netIncomeOf(previous)

  const equityRows = sideRows(current.equity, previous.equity)
  if (Math.abs(netIncomeCurrent) >= 0.01 || Math.abs(netIncomePrevious) >= 0.01) {
    equityRows.push(makeRow(NI_CODE, NI_CODE, NI_NAME, "EQUITY", netIncomeCurrent, netIncomePrevious))
  }

  const assets = { label: "Aset", rows: sideRows(current.assets, previous.assets) }
  const liabilities = { label: "Kewajiban", rows: sideRows(current.liabilities, previous.liabilities) }
  const equity = { label: "Ekuitas", rows: equityRows }

  const assetsWithTotal = { ...assets, ...totalOf(assets.rows) }
  const liabilitiesWithTotal = { ...liabilities, ...totalOf(liabilities.rows) }
  const equityWithTotal = { ...equity, ...totalOf(equity.rows) }

  return {
    assets: assetsWithTotal,
    liabilities: liabilitiesWithTotal,
    equity: equityWithTotal,
    netIncomeCurrent,
    netIncomePrevious,
    isBalanced:
      Math.abs(
        safeSubtract(
          safeSubtract(assetsWithTotal.totalCurrent, liabilitiesWithTotal.totalCurrent, 2),
          equityWithTotal.totalCurrent,
          2,
        ),
      ) < 0.01,
  }
}
