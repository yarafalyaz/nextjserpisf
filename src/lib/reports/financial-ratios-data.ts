/**
 * Pemuatan data untuk laporan **Rasio Keuangan**.
 *
 * Posisi (aset/kewajiban/ekuitas) dibaca sampai akhir periode; laba rugi dibaca
 * sepanjang periode. Nilai lancar & persediaan dikenali dari `reportGroup` COA
 * standar (AREC/BANK/INTR/OCAS untuk aset lancar, APAY/OCLY untuk kewajiban
 * jangka pendek).
 */

import { prisma } from "@/lib/db/prisma"
import { sumEntriesByAccount } from "@/lib/services/report-aggregation.service"
import { formatDate, formatDayMonthYear } from "@/lib/utils/format"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { computeIncomeStatement } from "@/lib/finance/income-statement"
import { computeFinancialRatios, type FinancialRatiosResult } from "@/lib/finance/financial-ratios"

const CURRENT_ASSET_GROUPS = new Set(["AREC", "BANK", "INTR", "OCAS"])
const CURRENT_LIABILITY_GROUPS = new Set(["APAY", "OCLY"])
const INVENTORY_GROUPS = new Set(["INTR"])

export interface FinancialRatiosReport {
  ratios: FinancialRatiosResult
  periodLabel: string
  periodCaption: string
}

export async function loadFinancialRatios(period: {
  start: Date
  end: Date
}): Promise<FinancialRatiosReport> {
  const [accounts, positionSums, periodSums] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, type: true, reportGroup: true },
      orderBy: { code: "asc" },
    }),
    sumEntriesByAccount({ date: { lte: period.end } }),
    sumEntriesByAccount({ date: { gte: period.start, lte: period.end } }),
  ])

  let currentAssets = 0
  let inventory = 0
  let totalAssets = 0
  let currentLiabilities = 0
  let totalLiabilities = 0
  let totalEquity = 0

  for (const account of accounts) {
    const sums = positionSums.get(account.id)
    if (!sums) continue
    const debitNormal = account.type === "ASSET" || account.type === "EXPENSE"
    const balance = debitNormal
      ? safeSubtract(sums.debit, sums.credit, 2)
      : safeSubtract(sums.credit, sums.debit, 2)
    if (balance === 0) continue

    if (account.type === "ASSET") {
      totalAssets = safeAdd(totalAssets, balance, 2)
      if (account.reportGroup && CURRENT_ASSET_GROUPS.has(account.reportGroup))
        currentAssets = safeAdd(currentAssets, balance, 2)
      if (account.reportGroup && INVENTORY_GROUPS.has(account.reportGroup))
        inventory = safeAdd(inventory, balance, 2)
    } else if (account.type === "LIABILITY") {
      totalLiabilities = safeAdd(totalLiabilities, balance, 2)
      if (account.reportGroup && CURRENT_LIABILITY_GROUPS.has(account.reportGroup)) {
        currentLiabilities = safeAdd(currentLiabilities, balance, 2)
      }
    } else if (account.type === "EQUITY") {
      totalEquity = safeAdd(totalEquity, balance, 2)
    }
  }

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

  // Posisi & laba rugi dibaca dengan status jurnal laporan yang sama
  // (POSTED + REVERSED, bawaan `sumEntriesByAccount`) — kalau berbeda, rasio dan
  // laporan keuangannya tidak akan cocok.

  const shortDate = (date: Date) =>
    formatDayMonthYear(date)
  const fullDate = (date: Date) =>
    formatDate(date, { format: "short" })

  return {
    ratios: computeFinancialRatios({
      currentAssets,
      inventory,
      totalAssets,
      currentLiabilities,
      totalLiabilities,
      totalEquity,
      revenue: income.totalRevenue,
      grossProfit: income.grossProfit,
      netProfit: income.netProfit,
    }),
    periodLabel: `Periode ${shortDate(period.start)} – ${shortDate(period.end)}`,
    periodCaption: `Dari ${fullDate(period.start)} s/d ${fullDate(period.end)}`,
  }
}
