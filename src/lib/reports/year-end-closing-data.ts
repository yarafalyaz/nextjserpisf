/**
 * Loader pratinjau jurnal penutup tahunan (F-2026-10-20-86) + pengumpul
 * baris bersama untuk inti posting (F-2026-10-23-121-V).
 *
 * Query massal tanpa N+1: akun P&L aktif, baris jurnal POSTED+REVERSED
 * (REPORT_JOURNAL_STATUSES) dalam tahun fiskal, pusat laba, cek anti-dobel
 * jurnal penutup. Loader publik tetap
 * read-only; `collectYearEndClosingEntries` diekspor agar service posting
 * menjalankan query yang SAMA di dalam transaksinya (satu sumber rumus —
 * builder `buildYearEndClosingPreview` tidak pernah disalin).
 *
 * Sejak inti F-121-V: akun tujuan dibaca dari kolom nyata
 * `SystemSetting.retainedEarningsAccountId` (migrasi 20261023150000).
 * Kolom kosong tetap dilaporkan belum dipetakan (`null`) — jangan menebak
 * akun laba ditahan dari nama/kode di sini; validasi tipe akun adalah
 * urusan resolver posting (fail-closed di service).
 */

import { prisma } from "@/lib/db/prisma"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"
import { getSystemSettings } from "@/lib/utils/settings"
import {
  buildYearEndClosingPreview,
  fiscalYearPeriod,
  YEAR_END_CLOSING_REFERENCE_TYPE,
  type YearEndClosingEntryInput,
  type YearEndClosingPreview,
} from "@/lib/reports/year-end-closing"

type YearEndClosingDb = Pick<typeof prisma, "account" | "journalEntry" | "profitCenter">

/** Baris masukan builder dari jurnal POSTED+REVERSED tahun fiskal, via client apa pun (prisma/tx). */
export async function collectYearEndClosingEntries(
  db: YearEndClosingDb,
  start: Date,
  end: Date,
): Promise<YearEndClosingEntryInput[]> {
  const [accounts, rows, profitCenters] = await Promise.all([
    db.account.findMany({
      where: { type: { in: ["REVENUE", "EXPENSE"] }, deletedAt: null },
      select: { id: true, code: true, name: true, type: true },
    }),
    db.journalEntry.findMany({
      where: {
        journal: {
          status: { in: [...REPORT_JOURNAL_STATUSES] },
          deletedAt: null,
          transactionDate: { gte: start, lte: end },
        },
        account: { type: { in: ["REVENUE", "EXPENSE"] } },
      },
      select: {
        accountId: true,
        profitCenterId: true,
        debit: true,
        credit: true,
        journal: { select: { status: true } },
      },
    }),
    db.profitCenter.findMany({ select: { id: true, code: true } }),
  ])

  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const profitCenterCodeById = new Map(profitCenters.map((center) => [center.id, center.code]))

  return rows.flatMap((row) => {
    const account = accountById.get(row.accountId)
    if (!account) return []
    return [
      {
        accountId: row.accountId,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        profitCenterId: row.profitCenterId,
        profitCenterCode: row.profitCenterId === null ? null : (profitCenterCodeById.get(row.profitCenterId) ?? null),
        journalStatus: row.journal.status,
        debit: Number(row.debit),
        credit: Number(row.credit),
      },
    ]
  })
}

export async function getYearEndClosingPreview(fiscalYear: number): Promise<YearEndClosingPreview> {
  const settings = await getSystemSettings()
  const fiscalYearStartMonth = settings.fiscalYearStartMonth
  const { start, end } = fiscalYearPeriod(fiscalYear, fiscalYearStartMonth)

  const [entries, existingClosing] = await Promise.all([
    collectYearEndClosingEntries(prisma, start, end),
    prisma.journal.findFirst({
      where: {
        referenceType: YEAR_END_CLOSING_REFERENCE_TYPE,
        referenceId: fiscalYear,
        status: "POSTED",
        deletedAt: null,
      },
      select: { id: true },
    }),
  ])

  return buildYearEndClosingPreview({
    fiscalYear,
    fiscalYearStartMonth,
    retainedEarningsAccountId: settings.retainedEarningsAccountId ?? null,
    alreadyClosed: existingClosing !== null,
    entries,
  })
}
