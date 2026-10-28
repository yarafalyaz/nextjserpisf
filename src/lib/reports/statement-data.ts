/**
 * Sumber data tunggal untuk laporan statement (Neraca, Laba Rugi).
 *
 * Halaman laporan dan route PDF memanggil fungsi di sini, sehingga angka di layar
 * dan angka di PDF dijamin sama: keduanya memakai query, aturan roll-up, dan
 * format label yang sama. Sebelumnya PDF laporan dibentuk dari DOM, jadi setiap
 * perubahan tampilan berisiko mengubah cetakan tanpa disadari.
 */

import { prisma } from "@/lib/db/prisma"
import { REPORT_JOURNAL_STATUSES, sumEntriesByAccount } from "@/lib/services/report-aggregation.service"
import { computeBalanceSheet } from "@/lib/finance/balance-sheet"
import {
  classifyIncomeStatementAccount,
  computeIncomeStatement,
  isCreditNormalSection,
  type IncomeStatementLine,
  type IncomeStatementResult,
  type IncomeStatementSection,
} from "@/lib/finance/income-statement"
import { buildStatementRows, type StatementAccount, type StatementDisplayOptions, type StatementRow } from "@/lib/reports/statement-display"
import {
  buildBalanceSheetTable,
  buildIncomeStatementTable,
  type StatementTable,
} from "@/lib/reports/statement-table"
import { formatDate, formatDayMonthYear, formatShortRange } from "@/lib/utils/format"

/** Label periode yang dipakai kop laporan dan kolom angka. */
export interface StatementLabels {
  /** Kiri kop, mis. "Per 31 Oktober 2026" atau "Dari 01 Jan 2026 s/d 13 Okt 2026". */
  periodCaption: string
  /** Label periode panjang, mis. "Periode 1 Jan 2026 – 13 Okt 2026". */
  periodLabel: string
}

export interface BalanceSheetStatement extends StatementLabels {
  table: StatementTable
  /** Tanggal posisi, mis. "31 Oktober 2026". */
  asOfLabel: string
}

export interface IncomeStatementStatement extends StatementLabels {
  table: StatementTable
  /** Judul kolom angka, mis. "1 Jan - 13 Okt 2026". */
  columnLabel: string
}

/** Nama bulan panjang Indonesia, mis. 2026-10-31 → "31 Oktober 2026". */
export function asOfLabelOf(date: Date): string {
  return formatDate(date)
}

/**
 * Bagian-bagian neraca (baris per kelompok + total) — dipakai baik penyusun
 * tabel Neraca standar maupun Neraca Induk Skontro, sehingga kedua laporan tidak
 * mungkin memakai angka kelompok yang berbeda.
 *
 * Saldo tiap akun dihitung sendiri (debit − kredit untuk aset, kredit − debit
 * untuk kewajiban/ekuitas) lalu disusun hierarkis sesuai opsi tampilan.
 */
export interface BalanceSheetParts {
  assetRows: StatementRow[]
  liabilityRows: StatementRow[]
  equityRows: StatementRow[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  isBalanced: boolean
  asOfLabel: string
}

export async function loadBalanceSheetParts(
  asOfDate: Date,
  options: StatementDisplayOptions,
): Promise<BalanceSheetParts> {
  const [entries, accounts] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        journal: {
          status: { in: [...REPORT_JOURNAL_STATUSES] },
          deletedAt: null,
          transactionDate: { lte: asOfDate },
        },
      },
      // Hanya kolom yang benar-benar dipakai di bawah ini. Tanpa `select`, neraca
      // menarik seluruh kolom journalEntry (termasuk memo/createdAt/dll) untuk
      // setiap baris jurnal sejak awal buku — pemborosan I/O tanpa manfaat.
      // `include` tidak bisa dipakai bersama `select`, jadi relasi akun ikut
      // dipilih sebagai `select` bersarang (name/code/type saja).
      select: {
        accountId: true,
        debit: true,
        credit: true,
        account: { select: { name: true, code: true, type: true } },
      },
    }),
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, code: true, name: true, type: true, parentId: true },
      orderBy: { code: "asc" },
    }),
  ])

  const { totalAssets, totalLiabilities, totalEquity, isBalanced } = computeBalanceSheet(
    entries.map((entry) => ({
      accountId: entry.accountId,
      accountName: entry.account.name,
      accountCode: entry.account.code,
      accountType: entry.account.type,
      debit: Number(entry.debit),
      credit: Number(entry.credit),
    })),
  )

  const ownBalance = new Map<number, number>()
  for (const entry of entries) {
    const creditNormal = entry.account.type === "LIABILITY" || entry.account.type === "EQUITY"
    const signed = creditNormal
      ? Number(entry.credit) - Number(entry.debit)
      : Number(entry.debit) - Number(entry.credit)
    ownBalance.set(entry.accountId, (ownBalance.get(entry.accountId) ?? 0) + signed)
  }

  const rowsOf = (type: string): StatementRow[] =>
    buildStatementRows(
      accounts
        .filter((account) => account.type === type)
        .map((account) => ({
          id: account.id,
          slug: account.slug,
          code: account.code,
          name: account.name,
          parentId: account.parentId,
          ownBalance: ownBalance.get(account.id) ?? 0,
        })),
      options,
    )

  return {
    assetRows: rowsOf("ASSET"),
    liabilityRows: rowsOf("LIABILITY"),
    equityRows: rowsOf("EQUITY"),
    totalAssets,
    totalLiabilities,
    totalEquity,
    isBalanced,
    asOfLabel: asOfLabelOf(asOfDate),
  }
}

/**
 * Neraca posisi "per" tanggal tertentu.
 */
export async function loadBalanceSheetStatement(
  asOfDate: Date,
  options: StatementDisplayOptions,
  lineLink?: { basePath: string; periodSlug: string },
): Promise<BalanceSheetStatement> {
  const parts = await loadBalanceSheetParts(asOfDate, options)

  return {
    table: buildBalanceSheetTable({
      asOfLabel: parts.asOfLabel,
      assetRows: parts.assetRows,
      liabilityRows: parts.liabilityRows,
      equityRows: parts.equityRows,
      totalAssets: parts.totalAssets,
      totalLiabilities: parts.totalLiabilities,
      totalEquity: parts.totalEquity,
      isBalanced: parts.isBalanced,
      lineLink,
    }),
    asOfLabel: parts.asOfLabel,
    periodLabel: `Per ${parts.asOfLabel}`,
    periodCaption: `Per ${parts.asOfLabel}`,
  }
}

/** Laba rugi multi tahap untuk rentang periode tertentu (jurnal terealisasi). */
export async function loadIncomeStatementStatement(
  period: { start: Date; end: Date },
  options: StatementDisplayOptions,
  showPercent: boolean,
): Promise<IncomeStatementStatement> {
  return loadIncomeStatementByStatus(period, options, showPercent, REPORT_JOURNAL_STATUSES)
}

/**
 * Laba rugi dengan pilihan status jurnal.
 *
 * Dipakai laporan **Terealisasi** (POSTED + REVERSED, sama dengan laba rugi
 * standar) dan **Tidak Terealisasi** (DRAFT — jurnal yang belum diposting).
 * Struktur tabel dan label subtotalnya tetap dari builder yang sama, jadi kedua
 * laporan tidak bisa berbeda bentuk.
 */
export async function loadIncomeStatementByStatus(
  period: { start: Date; end: Date },
  options: StatementDisplayOptions,
  showPercent: boolean,
  statuses: readonly string[],
  lineLink?: { basePath: string; periodSlug: string },
): Promise<IncomeStatementStatement> {
  const [accounts, periodSums] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, code: true, name: true, type: true, parentId: true, reportGroup: true },
      orderBy: { code: "asc" },
    }),
    sumEntriesByAccount({ date: { gte: period.start, lte: period.end }, statuses }),
  ])

  const lines = accounts.map((acc) => ({
    id: acc.id,
    slug: acc.slug,
    code: acc.code,
    name: acc.name,
    type: acc.type,
    // Tipe akun gaya Accurate menentukan pengelompokan laporan (HPP vs beban
    // operasional vs non-operasional) tanpa bergantung pada rentang kode.
    reportGroup: acc.reportGroup,
    debit: periodSums.get(acc.id)?.debit ?? 0,
    credit: periodSums.get(acc.id)?.credit ?? 0,
  }))

  const result = computeIncomeStatement(lines)

  const parentById = new Map(accounts.map((account) => [account.id, account.parentId]))
  const sectionAccounts: (StatementAccount & { section: IncomeStatementSection })[] = lines.flatMap(
    (line) => {
      const section = classifyIncomeStatementAccount(line)
      if (!section) return []
      const ownBalance = isCreditNormalSection(section)
        ? line.credit - line.debit
        : line.debit - line.credit
      return [
        {
          id: line.id,
          slug: line.slug,
          code: line.code,
          name: line.name,
          parentId: parentById.get(line.id) ?? null,
          ownBalance,
          section,
        },
      ]
    },
  )

  const rowsOf = (section: IncomeStatementSection): StatementRow[] =>
    buildStatementRows(sectionAccounts.filter((account) => account.section === section), options)

  const { start, end } = period
  const shortDate = (date: Date) =>
    formatDayMonthYear(date)
  const fullDate = (date: Date) =>
    formatDate(date, { format: "short" })
  const columnLabel = formatShortRange(start, end)

  return {
    table: buildIncomeStatementTable({
      showPercent,
      columnLabel,
      revenueRows: rowsOf("revenue"),
      cogsRows: rowsOf("cogs"),
      operatingExpenseRows: rowsOf("operating_expense"),
      otherIncomeRows: rowsOf("other_income"),
      otherExpenseRows: rowsOf("other_expense"),
      result,
      lineLink,
    }),
    columnLabel,
    periodLabel: `Periode ${shortDate(start)} – ${shortDate(end)}`,
    periodCaption: `Dari ${fullDate(start)} s/d ${fullDate(end)}`,
  }
}

/**
 * Pusat biaya berikut turunannya, supaya laporan induk mencakup sub-pusatnya.
 *
 * Iteratif dengan daftar "sudah dilihat": data pusat biaya yang melingkar
 * (A induk B dan B induk A — bisa terjadi lewat input manual) akan membuat versi
 * rekursif berjalan tanpa henti sampai prosesnya kehabisan memori.
 */
async function costCenterTreeIds(costCenterId: number): Promise<number[]> {
  const seen = new Set<number>([costCenterId])
  const queue = [costCenterId]

  while (queue.length > 0) {
    const current = queue.shift() as number
    const children = await prisma.costCenter.findMany({
      where: { parentId: current },
      select: { id: true },
    })

    for (const child of children) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      queue.push(child.id)
    }
  }

  return [...seen]
}

export interface IncomeStatementByCostCenterReport extends StatementLabels {
  table: StatementTable
  columnLabel: string
  /** Label pusat biaya terpilih, mis. "CC-01 — Bengkel"; null bila belum dipilih. */
  costCenterLabel: string | null
  totals: IncomeStatementResult
}

/**
 * Laba rugi satu pusat biaya (beserta sub-pusatnya), dengan bentuk multi-tahap
 * yang sama persis seperti `/laporan/laba-rugi` — lewat builder yang sama, supaya
 * kedua laporan tidak mungkin memakai struktur atau label subtotal yang berbeda.
 *
 * `reportGroup` ikut dikirim (lihat catatan di `income-statement.ts`): tanpa itu
 * akun HPP yang kodenya di luar 5000–5099 terhitung sebagai beban operasional,
 * dan "Laba Kotor" berubah menjadi sama dengan Pendapatan.
 */
export async function loadIncomeStatementByCostCenter(input: {
  costCenterId: number | null
  start: Date
  end: Date
}): Promise<IncomeStatementByCostCenterReport> {
  const { start, end } = input
  const shortDate = (date: Date) =>
    formatDayMonthYear(date)
  const fullDate = (date: Date) =>
    formatDate(date, { format: "short" })
  const columnLabel = formatShortRange(start, end)
  const labels = {
    columnLabel,
    periodLabel: `Periode ${shortDate(start)} – ${shortDate(end)}`,
    periodCaption: `Dari ${fullDate(start)} s/d ${fullDate(end)}`,
  }

  // Tanpa pusat biaya tidak ada yang bisa dilaporkan — lembar tetap terbentuk
  // (dengan catatan), bukan error, supaya halaman dan PDF menampilkan hal yang sama.
  if (input.costCenterId === null) {
    return {
      ...labels,
      table: {
        columns: [{ header: "Kode", align: "left" }, { header: "Deskripsi", align: "left" }, { header: "Nilai (IDR)", align: "right" }],
        rows: [{ kind: "notice", text: "Pilih pusat biaya dan periode untuk menampilkan laporan." }],
      },
      costCenterLabel: null,
      totals: EMPTY_INCOME_STATEMENT,
    }
  }

  const [costCenter, ccIds] = await Promise.all([
    prisma.costCenter.findUnique({
      where: { id: input.costCenterId },
      select: { code: true, name: true },
    }),
    costCenterTreeIds(input.costCenterId),
  ])

  const [accounts, ccSums] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, type: true, reportGroup: true },
      orderBy: { code: "asc" },
    }),
    sumEntriesByAccount({ costCenterIds: ccIds, date: { gte: start, lte: end } }),
  ])

  const result = computeIncomeStatement(
    accounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      reportGroup: account.reportGroup,
      debit: ccSums.get(account.id)?.debit ?? 0,
      credit: ccSums.get(account.id)?.credit ?? 0,
    })),
  )

  // Akun disusun datar per kelompok (laporan ini per pusat biaya, bukan hierarki
  // akun induk/anak) — struktur tahapannya tetap dari builder yang sama.
  const sectionRows = (lines: IncomeStatementLine[]): StatementRow[] =>
    lines.map((line) => ({
      id: line.id,
      code: line.code,
      name: line.name,
      balance: line.balance,
      level: 0,
      hasChildren: false,
    }))

  return {
    ...labels,
    table: buildIncomeStatementTable({
      showPercent: false,
      columnLabel,
      revenueRows: sectionRows(result.revenueData),
      cogsRows: sectionRows(result.cogsData),
      operatingExpenseRows: sectionRows(result.expenseData),
      otherIncomeRows: sectionRows(result.otherIncomeData),
      otherExpenseRows: sectionRows(result.otherExpenseData),
      result,
    }),
    costCenterLabel: costCenter ? `${costCenter.code} — ${costCenter.name}` : null,
    totals: result,
  }
}

const EMPTY_INCOME_STATEMENT: IncomeStatementResult = {
  revenueData: [],
  cogsData: [],
  expenseData: [],
  otherIncomeData: [],
  otherExpenseData: [],
  totalRevenue: 0,
  totalCogs: 0,
  grossProfit: 0,
  totalExpense: 0,
  operatingProfit: 0,
  totalOtherIncome: 0,
  totalOtherExpense: 0,
  totalOther: 0,
  netProfit: 0,
  margin: 0,
}
