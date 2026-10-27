/**
 * Pratinjau jurnal penutup tahunan (F-2026-10-20-86, sub-bagian AMAN read-only).
 *
 * Vonis accountant (Salsa, board 20:10 WIB): akun P&L tiap tahun buku ditutup
 * ke SATU akun laba ditahan dari pengaturan, per pusat laba; baris penutup
 * membalik saldo penuh akun P&L, baris lawan laba ditahan membawa laba bersih
 * per pusat laba yang sama. Referensi jurnal kelak `YearEndClosing` +
 * referenceId=tahun — cek anti-dobelnya ada di loader, postingnya INTI
 * ditunda-teknis (PUTUSAN manager 20:04) dan TIDAK dibangun di sini.
 *
 * Berkas ini hanya menghitung pratinjau dari baris jurnal yang sudah
 * dikumpulkan loader:
 * - jurnal POSTED + REVERSED (konvensi GL `REPORT_JOURNAL_STATUSES` di
 *   report-aggregation.service.ts): jurnal lawan reversal berstatus POSTED
 *   sehingga pasangan (REVERSED asli + POSTED lawan, tanggal sama) neto
 *   nol. DRAFT tidak ikut saldo. Loader menyaring status yang sama dan
 *   builder menyaring ulang agar pemanggil lain tidak membocorkan status
 *   lain. Menghitung POSTED saja akan menyisakan lawan sebelah yatim,
 * - saldo per (akun P&L, profitCenterId): REVENUE normal kredit
 *   (saldo = kredit − debit), EXPENSE normal debit (saldo = debit − kredit);
 *   baris penutup membalik saldo itu, kontra-akun (saldo lawan normal, mis.
 *   Diskon Penjualan bersaldo debit) arahnya ikut terbalik otomatis,
 * - akun tujuan tampil `belum dipetakan` selama pengaturan kosong — jangan
 *   menebak akun 300002 di kode; total tetap dihitung dan `balanced` hanya
 *   benar bila debet = kredit persis sen.
 *
 * Pure (tanpa Prisma/DOM); loader massalnya ada di `year-end-closing-data.ts`.
 */

import { safeAdd, safeRound } from "@/lib/utils/math"

export const YEAR_END_CLOSING_REFERENCE_TYPE = "YearEndClosing" as const

export type YearEndClosingDirection = "debit" | "credit"

export interface YearEndClosingEntryInput {
  accountId: number
  accountCode: string
  accountName: string
  /** Account.type: hanya REVENUE/EXPENSE yang ditutup; tipe lain disaring. */
  accountType: string
  profitCenterId: number | null
  profitCenterCode: string | null
  /** Status jurnal induk; hanya POSTED/REVERSED (REPORT_JOURNAL_STATUSES) yang dihitung. */
  journalStatus: string
  debit: number
  credit: number
}

export interface YearEndClosingAccountLine {
  accountId: number
  accountCode: string
  accountName: string
  accountType: "REVENUE" | "EXPENSE"
  profitCenterId: number | null
  profitCenterCode: string | null
  /** Saldo sesuai sisi normal akun (kredit untuk REVENUE, debit untuk EXPENSE). */
  balance: number
  /** Baris penutup selalu membalik saldo; nol berarti tidak ada baris. */
  closingDirection: YearEndClosingDirection
  closingAmount: number
}

export interface YearEndClosingRetainedLine {
  profitCenterId: number | null
  profitCenterCode: string | null
  /** Laba bersih pusat laba ini; negatif berarti rugi bersih. */
  netProfit: number
  /** Laba bersih dikredit ke laba ditahan; rugi bersih didebit. */
  direction: YearEndClosingDirection
}

export interface YearEndClosingPreview {
  fiscalYear: number
  closingDate: Date
  lines: YearEndClosingAccountLine[]
  retainedLines: YearEndClosingRetainedLine[]
  totalDebit: number
  totalCredit: number
  /** totalDebit − totalCredit dalam sen; 0 berarti seimbang. */
  difference: number
  balanced: boolean
  netProfit: number
  /** false selama pengaturan laba ditahan kosong (belum dipetakan). */
  retainedEarningsMapped: boolean
  /** Jurnal penutup POSTED untuk tahun ini sudah ada. */
  alreadyClosed: boolean
}

/** Tahun fiskal (kalender tahun mulai) + tanggal penutup dari bulan mulai. */
export function fiscalYearPeriod(fiscalYear: number, fiscalYearStartMonth: number): { start: Date; end: Date } {
  const month = Math.min(12, Math.max(1, Math.trunc(fiscalYearStartMonth) || 1))
  const start = new Date(Date.UTC(fiscalYear, month - 1, 1))
  // Hari terakhir bulan sebelum bulan mulai, tahun fiskal berikutnya.
  const end = new Date(Date.UTC(fiscalYear + 1, month - 1, 0, 23, 59, 59, 999))
  return { start, end }
}

function groupKey(accountId: number, profitCenterId: number | null): string {
  return `${accountId}:${profitCenterId ?? "null"}`
}

export function buildYearEndClosingPreview(input: {
  fiscalYear: number
  fiscalYearStartMonth: number
  retainedEarningsAccountId: number | null
  entries: readonly YearEndClosingEntryInput[]
  alreadyClosed: boolean
}): YearEndClosingPreview {
  const { end } = fiscalYearPeriod(input.fiscalYear, input.fiscalYearStartMonth)

  const groups = new Map<string, YearEndClosingAccountLine>()
  for (const entry of input.entries) {
    // POSTED + REVERSED (REPORT_JOURNAL_STATUSES): pasangan reversal neto nol.
    if (entry.journalStatus !== "POSTED" && entry.journalStatus !== "REVERSED") continue
    if (entry.accountType !== "REVENUE" && entry.accountType !== "EXPENSE") continue
    const key = groupKey(entry.accountId, entry.profitCenterId)
    const existing = groups.get(key)
    const line: YearEndClosingAccountLine =
      existing ??
      {
        accountId: entry.accountId,
        accountCode: entry.accountCode,
        accountName: entry.accountName,
        accountType: entry.accountType,
        profitCenterId: entry.profitCenterId,
        profitCenterCode: entry.profitCenterCode,
        balance: 0,
        closingDirection: entry.accountType === "REVENUE" ? "debit" : "credit",
        closingAmount: 0,
      }
    const signed =
      entry.accountType === "REVENUE" ? entry.credit - entry.debit : entry.debit - entry.credit
    line.balance = safeAdd(line.balance, safeRound(signed, 2), 2)
    groups.set(key, line)
  }

  const lines: YearEndClosingAccountLine[] = []
  const netByProfitCenter = new Map<string, YearEndClosingRetainedLine>()
  let totalDebit = 0
  let totalCredit = 0
  let netProfit = 0

  for (const line of groups.values()) {
    line.balance = safeRound(line.balance, 2)
    if (line.balance === 0) continue
    // Saldo normal positif ditutup dengan arah lawan; saldo kontra (negatif)
    // ditutup dengan arah yang sama dengan sisi normalnya.
    const normalDirection: YearEndClosingDirection = line.accountType === "REVENUE" ? "debit" : "credit"
    line.closingDirection = line.balance > 0 ? normalDirection : line.accountType === "REVENUE" ? "credit" : "debit"
    line.closingAmount = Math.abs(line.balance)
    lines.push(line)
    if (line.closingDirection === "debit") totalDebit = safeAdd(totalDebit, line.closingAmount, 2)
    else totalCredit = safeAdd(totalCredit, line.closingAmount, 2)

    const profit = line.accountType === "REVENUE" ? line.balance : -line.balance
    netProfit = safeAdd(netProfit, profit, 2)
    const pcKey = String(line.profitCenterId ?? "null")
    const retained = netByProfitCenter.get(pcKey) ?? {
      profitCenterId: line.profitCenterId,
      profitCenterCode: line.profitCenterCode,
      netProfit: 0,
      direction: "credit" as YearEndClosingDirection,
    }
    retained.netProfit = safeAdd(retained.netProfit, profit, 2)
    netByProfitCenter.set(pcKey, retained)
  }

  lines.sort(
    (a, b) =>
      a.accountCode.localeCompare(b.accountCode, "id-ID") ||
      String(a.profitCenterId ?? "").localeCompare(String(b.profitCenterId ?? "")),
  )

  const retainedLines: YearEndClosingRetainedLine[] = []
  for (const retained of netByProfitCenter.values()) {
    retained.netProfit = safeRound(retained.netProfit, 2)
    if (retained.netProfit === 0) continue
    retained.direction = retained.netProfit > 0 ? "credit" : "debit"
    retainedLines.push(retained)
    if (retained.direction === "debit") totalDebit = safeAdd(totalDebit, Math.abs(retained.netProfit), 2)
    else totalCredit = safeAdd(totalCredit, Math.abs(retained.netProfit), 2)
  }
  retainedLines.sort((a, b) => String(a.profitCenterId ?? "").localeCompare(String(b.profitCenterId ?? "")))

  totalDebit = safeRound(totalDebit, 2)
  totalCredit = safeRound(totalCredit, 2)
  const difference = safeRound(totalDebit - totalCredit, 2)

  return {
    fiscalYear: input.fiscalYear,
    closingDate: end,
    lines,
    retainedLines,
    totalDebit,
    totalCredit,
    difference,
    balanced: difference === 0,
    netProfit: safeRound(netProfit, 2),
    retainedEarningsMapped: input.retainedEarningsAccountId !== null,
    alreadyClosed: input.alreadyClosed,
  }
}
