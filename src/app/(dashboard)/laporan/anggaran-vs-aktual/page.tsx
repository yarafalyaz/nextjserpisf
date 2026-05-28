export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { Target, DollarSign, TrendingDown, BarChart3, Percent } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportDateFilter } from "@/components/reports/report-date-filter"

export default async function BudgetVsActualPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  // Default: current quarter
  const currentQuarter = Math.floor(now.getMonth() / 3)
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(now.getFullYear(), currentQuarter * 3, 1)
  const endDate = params.endDate
    ? new Date(params.endDate)
    : new Date(now.getFullYear(), currentQuarter * 3 + 3, 0)

  // Fetch budgets that overlap with the period
  const budgets = await prisma.budget.findMany({
    where: {
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    orderBy: { name: 'asc' },
  })

  // Get account and cost center info
  const accountIds = [...new Set(budgets.map((b) => b.accountId))]
  const costCenterIds = [...new Set(budgets.filter((b) => b.costCenterId).map((b) => b.costCenterId!))]

  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, code: true, name: true },
  })

  const costCenters = costCenterIds.length > 0
    ? await prisma.costCenter.findMany({
        where: { id: { in: costCenterIds } },
        select: { id: true, code: true, name: true },
      })
    : []

  // Get actual expenses from journal entries for these accounts in the period
  const journalEntries = await prisma.journalEntry.findMany({
    where: {
      accountId: { in: accountIds },
      journal: {
        status: 'POSTED',
        transactionDate: { gte: startDate, lte: endDate },
      },
      ...(costCenterIds.length > 0 ? {} : {}),
    },
    select: {
      accountId: true,
      costCenterId: true,
      debit: true,
      credit: true,
    },
  })

  // Aggregate actuals by account + costCenter
  const actualMap = new Map<string, number>()
  for (const entry of journalEntries) {
    const key = `${entry.accountId}-${entry.costCenterId || 0}`
    const current = actualMap.get(key) || 0
    actualMap.set(key, current + Number(entry.debit) - Number(entry.credit))
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  const costCenterMap = new Map(costCenters.map((c) => [c.id, c]))

  // Build report rows
  const rows = budgets.map((budget) => {
    const account = accountMap.get(budget.accountId)
    const costCenter = budget.costCenterId ? costCenterMap.get(budget.costCenterId) : null
    const key = `${budget.accountId}-${budget.costCenterId || 0}`
    const actual = actualMap.get(key) || 0
    const budgetAmount = Number(budget.amount)
    const variance = budgetAmount - actual
    const percentage = budgetAmount > 0 ? (actual / budgetAmount) * 100 : 0

    return {
      id: budget.id,
      name: budget.name,
      accountName: account ? `${account.code} - ${account.name}` : '-',
      costCenterName: costCenter ? costCenter.name : '-',
      budget: budgetAmount,
      actual,
      variance,
      percentage,
    }
  })

  const totalBudget = rows.reduce((sum, r) => sum + r.budget, 0)
  const totalActual = rows.reduce((sum, r) => sum + r.actual, 0)
  const totalVariance = totalBudget - totalActual
  const avgPercentage = rows.length > 0 ? rows.reduce((sum, r) => sum + r.percentage, 0) / rows.length : 0

  const getColorClass = (pct: number) => {
    if (pct > 100) return 'text-danger'
    if (pct >= 80) return 'text-warning'
    return 'text-success'
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Reports", href: "/laporan" },
        { label: "Budget vs Actual" },
      ]} />

      <div className="flex items-center gap-2">
        <Target size={24} />
        <h1 className="text-2xl font-bold text-foreground">Budget vs Realisasi</h1>
        <ExportButtons title="Budget_vs_Actual" />
      </div>

      <ReportDateFilter defaultStartDate={startDate.toISOString().split('T')[0]} defaultEndDate={endDate.toISOString().split('T')[0]} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <DollarSign size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted">Total Budget</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(totalBudget)}</p>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-info/10">
            <BarChart3 size={20} className="text-info" />
          </div>
          <div>
            <p className="text-xs text-muted">Total Realisasi</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(totalActual)}</p>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-success/10">
            <TrendingDown size={20} className="text-success" />
          </div>
          <div>
            <p className="text-xs text-muted">Total Selisih</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(totalVariance)}</p>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-warning/10">
            <Percent size={20} className="text-warning" />
          </div>
          <div>
            <p className="text-xs text-muted">Rata-rata % Terpakai</p>
            <p className="text-sm font-semibold text-foreground">{avgPercentage.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Detail Budget vs Realisasi</h2>
          <p className="text-xs text-muted">
            {startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} - {endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="p-4 px-5">
          {rows.length === 0 ? (
            <div className="text-center py-8">
              <Target size={48} className="mx-auto text-muted mb-3" />
              <p className="text-muted text-sm">Tidak ada budget dalam periode ini</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>Nama Budget</DetailTableTh>
                  <DetailTableTh>Akun</DetailTableTh>
                  <DetailTableTh>Cost Center</DetailTableTh>
                  <DetailTableTh align="right">Budget</DetailTableTh>
                  <DetailTableTh align="right">Realisasi</DetailTableTh>
                  <DetailTableTh align="right">Selisih</DetailTableTh>
                  <DetailTableTh align="right">% Terpakai</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {rows.map((row) => (
                    <DetailTableRow key={row.id}>
                      <DetailTableTd>{row.name}</DetailTableTd>
                      <DetailTableTd>{row.accountName}</DetailTableTd>
                      <DetailTableTd>{row.costCenterName}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(row.budget)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(row.actual)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(row.variance)}</DetailTableTd>
                      <DetailTableTd align="right" className={getColorClass(row.percentage)}>
                        {row.percentage.toFixed(1)}%
                      </DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
              </DetailTable>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
