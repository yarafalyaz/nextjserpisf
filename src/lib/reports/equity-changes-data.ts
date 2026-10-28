/**
 * Pemuatan data untuk laporan **Perubahan Ekuitas** & **Laba Ditahan**.
 *
 * Saldo awal = posisi sebelum tanggal mulai periode (`lt: start`); saldo akhir =
 * posisi sampai akhir periode. Akun ekuitas bersaldo kredit, jadi saldonya
 * `kredit − debit`.
 */

import { prisma } from "@/lib/db/prisma"
import { sumEntriesByAccount } from "@/lib/services/report-aggregation.service"
import { computeIncomeStatement } from "@/lib/finance/income-statement"
import { formatDate, formatDayMonthYear } from "@/lib/utils/format"
import { safeSubtract } from "@/lib/utils/math"
import type { EquityAccountRow } from "@/lib/reports/equity-changes"

export interface EquityChangesReport {
  accounts: EquityAccountRow[]
  netProfit: number
  periodLabel: string
  periodCaption: string
}

export async function loadEquityChanges(period: {
  start: Date
  end: Date
}): Promise<EquityChangesReport> {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, type: true, reportGroup: true },
    orderBy: { code: "asc" },
  })

  const [openingSums, closingSums, periodSums] = await Promise.all([
    sumEntriesByAccount({ date: { lt: period.start } }),
    sumEntriesByAccount({ date: { lte: period.end } }),
    sumEntriesByAccount({ date: { gte: period.start, lte: period.end } }),
  ])

  const creditBalance = (sums?: { debit: number; credit: number }) =>
    sums ? safeSubtract(sums.credit, sums.debit, 2) : 0

  const rows: EquityAccountRow[] = accounts
    .filter((account) => account.type === "EQUITY")
    .map((account) => {
      const opening = creditBalance(openingSums.get(account.id))
      const closing = creditBalance(closingSums.get(account.id))
      return {
        id: account.id,
        code: account.code,
        name: account.name,
        opening,
        movement: safeSubtract(closing, opening, 2),
        closing,
      }
    })
    // Akun induk tanpa postingan sendiri (saldo 0) tidak perlu ditampilkan.
    .filter((row) => row.opening !== 0 || row.closing !== 0)

  const income = computeIncomeStatement(
    accounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      reportGroup: account.reportGroup,
      debit: periodSums.get(account.id)?.debit ?? 0,
      credit: periodSums.get(account.id)?.credit ?? 0,
    })),
  )

  const shortDate = (date: Date) =>
    formatDayMonthYear(date)
  const fullDate = (date: Date) =>
    formatDate(date, { format: "short" })

  return {
    accounts: rows,
    netProfit: income.netProfit,
    periodLabel: `Periode ${shortDate(period.start)} – ${shortDate(period.end)}`,
    periodCaption: `Dari ${fullDate(period.start)} s/d ${fullDate(period.end)}`,
  }
}
