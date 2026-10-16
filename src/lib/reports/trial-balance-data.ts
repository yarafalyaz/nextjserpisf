/**
 * Data Neraca Saldo untuk halaman laporan dan PDF — satu sumber, sehingga angka di
 * layar dan di PDF tidak mungkin berbeda.
 */

import { prisma } from "@/lib/db/prisma"
import { sumEntriesByAccount } from "@/lib/services/report-aggregation.service"
import { computeTrialBalance } from "@/lib/finance/trial-balance"
import {
  buildTrialBalanceReport,
  type TrialBalanceReportInput,
  type TrialBalanceReportResult,
} from "@/lib/reports/trial-balance-report"
import { asOfLabelOf } from "@/lib/reports/statement-data"

export interface TrialBalanceReportView extends TrialBalanceReportResult {
  periodLabel: string
  periodCaption: string
  asOfLabel: string
}

/**
 * Neraca saldo posisi per tanggal. `compareDate` (opsional) menambahkan kolom
 * pembanding pada tabel yang sama.
 */
export async function loadTrialBalanceReport(
  asOfDate: Date,
  compareDate: Date | null,
): Promise<TrialBalanceReportView> {
  const [accounts, asOfSums] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
    sumEntriesByAccount({ date: { lte: asOfDate } }),
  ])

  const { lines, grandTotalDebit, grandTotalCredit, isBalanced } = computeTrialBalance(
    accounts.map((acc) => ({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      totalDebit: asOfSums.get(acc.id)?.debit ?? 0,
      totalCredit: asOfSums.get(acc.id)?.credit ?? 0,
    })),
  )

  const asOfLabel = asOfLabelOf(asOfDate)

  let comparison: TrialBalanceReportInput["comparison"] = null
  if (compareDate) {
    const compareSums = await sumEntriesByAccount({ date: { lte: compareDate } })
    const rows = accounts
      .map((account) => {
        const sums = asOfSums.get(account.id)
        const compare = compareSums.get(account.id)
        return {
          id: account.id,
          code: account.code,
          name: account.name,
          net1: (sums?.debit ?? 0) - (sums?.credit ?? 0),
          net2: (compare?.debit ?? 0) - (compare?.credit ?? 0),
        }
      })
      .filter((row) => row.net1 !== 0 || row.net2 !== 0)

    comparison = { rows, label: asOfLabelOf(compareDate) }
  }

  const report = buildTrialBalanceReport({
    lines,
    grandTotalDebit,
    grandTotalCredit,
    isBalanced,
    asOfLabel,
    comparison,
  })

  return {
    ...report,
    asOfLabel,
    periodLabel: `Per ${asOfLabel}`,
    periodCaption: `Per ${asOfLabel}`,
  }
}
