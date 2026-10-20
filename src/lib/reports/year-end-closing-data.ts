/**
 * Loader read-only pratinjau jurnal penutup tahunan (F-2026-10-20-86).
 *
 * Tiga query massal: pengaturan (bulan mulai tahun fiskal), akun P&L aktif,
 * baris jurnal POSTED dalam tahun fiskal, plus satu cek anti-dobel jurnal
 * penutup. Tanpa N+1, tanpa mutasi, tanpa jurnal. Posting penutup adalah
 * INTI ditunda-teknis (PUTUSAN manager 20:04) — loader ini tidak menulis
 * apa pun.
 *
 * Batasan jujur:
 * - Kolom pengaturan `retainedEarningsAccountId` BELUM ada di skema (inti
 *   migrasi ditunda), jadi akun tujuan selalu dilaporkan belum dipetakan
 *   (`null`) — jangan menebak akun laba ditahan dari nama/kode di sini.
 * - Hanya jurnal POSTED yang dihitung; builder menyaring ulang status dan
 *   tipe akun, jadi perubahan loader tidak membocorkan DRAFT/REVERSED atau
 *   akun neraca ke pratinjau.
 */

import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import {
  buildYearEndClosingPreview,
  fiscalYearPeriod,
  YEAR_END_CLOSING_REFERENCE_TYPE,
  type YearEndClosingPreview,
} from "@/lib/reports/year-end-closing"

export async function getYearEndClosingPreview(fiscalYear: number): Promise<YearEndClosingPreview> {
  const settings = await getSystemSettings()
  const fiscalYearStartMonth = settings.fiscalYearStartMonth
  const { start, end } = fiscalYearPeriod(fiscalYear, fiscalYearStartMonth)

  const [accounts, rows, profitCenters, existingClosing] = await Promise.all([
    prisma.account.findMany({
      where: { type: { in: ["REVENUE", "EXPENSE"] }, deletedAt: null },
      select: { id: true, code: true, name: true, type: true },
    }),
    prisma.journalEntry.findMany({
      where: {
        journal: {
          status: "POSTED",
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
    prisma.profitCenter.findMany({ select: { id: true, code: true } }),
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

  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const profitCenterCodeById = new Map(profitCenters.map((center) => [center.id, center.code]))

  return buildYearEndClosingPreview({
    fiscalYear,
    fiscalYearStartMonth,
    // ponytail: kolom setting inti belum ada (migrasi ditunda) — selalu belum dipetakan sampai inti dibuka.
    retainedEarningsAccountId: null,
    alreadyClosed: existingClosing !== null,
    entries: rows.flatMap((row) => {
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
    }),
  })
}
