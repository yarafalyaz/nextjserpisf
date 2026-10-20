/**
 * Pemuatan seri bulanan untuk laporan **Grafik Keuangan**.
 *
 * Agregasi tetap di sisi DB (`sumEntriesByAccount` → `groupBy`), bukan menarik
 * seluruh baris jurnal ke memori. Saldo posisi bersifat kumulatif: bulan ke-n =
 * saldo awal sebelum periode + jumlah bulan 1..n, sehingga jumlah bulan tidak
 * pernah dihitung dua kali dengan saldo awal.
 */

import { prisma } from "@/lib/db/prisma"
import { computeIncomeStatement } from "@/lib/finance/income-statement"
import { monthBuckets, type MonthlyMetric } from "@/lib/reports/financial-charts"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { sumEntriesByAccount, type AccountSums } from "@/lib/services/report-aggregation.service"
import { safeAdd, safeSubtract } from "@/lib/utils/math"

/** Kelompok akun lancar — sama dengan yang dipakai laporan Rasio Keuangan. */
const CURRENT_ASSET_GROUPS = new Set(["BANK", "AREC", "INTR", "OCAS"])
const CURRENT_LIABILITY_GROUPS = new Set(["APAY", "OCLY"])

export interface FinancialChartsReport {
  metrics: MonthlyMetric[]
  periodLabel: string
  periodCaption: string
}

export interface FinancialChartAccount {
  id: number
  code: string
  name: string
  type: string
  reportGroup: string | null
}

export function balanceTotals(
  accounts: FinancialChartAccount[],
  sums: Map<number, AccountSums>,
): Pick<MonthlyMetric, "totalAssets" | "totalLiabilities" | "totalEquity" | "currentAssets" | "currentLiabilities"> {
  let totalAssets = 0
  let totalLiabilities = 0
  let totalEquity = 0
  let currentAssets = 0
  let currentLiabilities = 0

  for (const account of accounts) {
    const sum = sums.get(account.id)
    if (!sum) continue
    const net =
      account.type === "ASSET" ? safeSubtract(sum.debit, sum.credit, 2) : safeSubtract(sum.credit, sum.debit, 2)
    if (net === 0) continue

    if (account.type === "ASSET") {
      totalAssets = safeAdd(totalAssets, net, 2)
      if (account.reportGroup && CURRENT_ASSET_GROUPS.has(account.reportGroup)) currentAssets = safeAdd(currentAssets, net, 2)
    } else if (account.type === "LIABILITY") {
      totalLiabilities = safeAdd(totalLiabilities, net, 2)
      if (account.reportGroup && CURRENT_LIABILITY_GROUPS.has(account.reportGroup)) currentLiabilities = safeAdd(currentLiabilities, net, 2)
    } else if (account.type === "EQUITY") {
      totalEquity = safeAdd(totalEquity, net, 2)
    }
  }

  return { totalAssets, totalLiabilities, totalEquity, currentAssets, currentLiabilities }
}

/** Gabung jumlah bulanan ke kumulatif, persis sen per akun. */
export function accumulateAccountSums(
  cumulative: Map<number, AccountSums>,
  monthly: Map<number, AccountSums>,
): Map<number, AccountSums> {
  const next = new Map<number, AccountSums>(cumulative)
  for (const [accountId, sums] of monthly) {
    const current = next.get(accountId)
    next.set(
      accountId,
      current
        ? { debit: safeAdd(current.debit, sums.debit, 2), credit: safeAdd(current.credit, sums.credit, 2) }
        : { ...sums },
    )
  }
  return next
}

export async function loadFinancialMetrics(period: { start: Date; end: Date }): Promise<FinancialChartsReport> {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, type: true, reportGroup: true },
  })

  const months = monthBuckets(period)
  const opening = await sumEntriesByAccount({ date: { lt: period.start } })
  let cumulative = new Map<number, AccountSums>(opening)

  const metrics: MonthlyMetric[] = []
  for (const month of months) {
    const monthly = await sumEntriesByAccount({ date: { gte: month.start, lte: month.end } })
    cumulative = accumulateAccountSums(cumulative, monthly)

    const income = computeIncomeStatement(
      accounts.map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        reportGroup: account.reportGroup,
        debit: monthly.get(account.id)?.debit ?? 0,
        credit: monthly.get(account.id)?.credit ?? 0,
      })),
    )

    metrics.push({
      label: month.label,
      // Didefinisikan agar pendapatan − biaya = laba bersih (lihat catatan modul pure).
      revenue: safeAdd(income.totalRevenue, income.totalOtherIncome, 2),
      expense: safeAdd(safeAdd(income.totalCogs, income.totalExpense, 2), income.totalOtherExpense, 2),
      netProfit: income.netProfit,
      ...balanceTotals(accounts, cumulative),
    })
  }

  return { metrics, ...rangePeriodLabels(period) }
}
