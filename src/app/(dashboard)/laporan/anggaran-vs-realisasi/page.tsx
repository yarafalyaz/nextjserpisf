export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { sumNetByAccountAndCostCenter } from "@/lib/services/report-aggregation.service"
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { BudgetFilterBar } from "./budget-filter-bar"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Anggaran vs Realisasi" }

export default async function BudgetVsRealisasiPage({
  searchParams,
}: {
  searchParams: Promise<{ costCenterId?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')
  const sp = await searchParams

  const now = new Date()
  const startDate = sp.tanggalMulai ? new Date(sp.tanggalMulai) : new Date(now.getFullYear(), 0, 1)
  const endDate = sp.tanggalSelesai ? new Date(sp.tanggalSelesai) : now
  endDate.setHours(23, 59, 59, 999)

  const budgets = await prisma.budget.findMany({
    where: { 
      costCenterId: sp.costCenterId ? Number(sp.costCenterId) : undefined,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    orderBy: { name: 'asc' },
  })

  const accountIds = [...new Set(budgets.map((b) => b.accountId))]
  const costCenterIds = [...new Set(budgets.filter((b) => b.costCenterId).map((b) => b.costCenterId!))]

  const [accounts, costCenters, actualMap] = await Promise.all([
    prisma.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, code: true, name: true } }),
    costCenterIds.length > 0
      ? prisma.costCenter.findMany({ where: { id: { in: costCenterIds } }, select: { id: true, code: true, name: true } })
      : Promise.resolve([]),
    // Aggregated in SQL (account x cost center) instead of materialising every
    // journal line of the period just to sum debit - credit.
    sumNetByAccountAndCostCenter({ accountIds, date: { gte: startDate, lte: endDate } }),
  ])

  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  const costCenterMap = new Map(costCenters.map((c) => [c.id, c]))

  const rows = budgets.map((budget) => {
    const account = accountMap.get(budget.accountId)
    const costCenter = budget.costCenterId ? costCenterMap.get(budget.costCenterId) : null
    const key = `${budget.accountId}-${budget.costCenterId || 0}`
    const actual = actualMap.get(key) || 0
    const budgetAmount = Number(budget.amount)
    const variance = budgetAmount - actual
    const percentage = budgetAmount > 0 ? (actual / budgetAmount) * 100 : 0
    return { id: budget.id, name: budget.name, accountName: account ? `${account.code} - ${account.name}` : '-',
      costCenterName: costCenter ? `${costCenter.code} - ${costCenter.name}` : '-',
      budget: budgetAmount, actual, variance, percentage }
  })

  const totalBudget = rows.reduce((sum, r) => sum + r.budget, 0)
  const totalActual = rows.reduce((sum, r) => sum + r.actual, 0)
  const totalVariance = totalBudget - totalActual
  const avgPercentage = rows.length > 0 ? rows.reduce((sum, r) => sum + r.percentage, 0) / rows.length : 0

  const allCostCenters = await prisma.costCenter.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  })

  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Laporan", href: "/laporan" }, { label: "Anggaran vs Realisasi" }]} />
      </div>
      <div className="flex items-center justify-end print:hidden"><ExportButtons title="Anggaran_vs_Realisasi" /></div>
      <BudgetFilterBar costCenters={allCostCenters} />
      <ReportLetterhead title="Anggaran vs Realisasi" subtitle="Budget vs Actual" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Anggaran vs Realisasi membandingkan realisasi keuangan dengan anggaran yang telah ditetapkan untuk periode berjalan, dengan filter per pusat biaya." />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 print:hidden">
        <ReportKpiCard label="Total Anggaran" value={formatCurrency(totalBudget)} />
        <ReportKpiCard label="Total Realisasi" value={formatCurrency(totalActual)} />
        <ReportKpiCard label="Total Selisih" value={formatCurrency(totalVariance)} />
        <ReportKpiCard label="Rata-rata % Terpakai" value={`${avgPercentage.toFixed(1)}%`} />
      </div>
      <ReportSection title="Detail Anggaran vs Realisasi">
        {rows.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Tidak ada budget dalam periode ini.</p>
        ) : (
          <DetailTable data-report-table="Budget vs Actual">
            <DetailTableHead>
              <DetailTableTh>Nama Anggaran</DetailTableTh><DetailTableTh>Akun</DetailTableTh>
              <DetailTableTh>Pusat Biaya</DetailTableTh><DetailTableTh align="right">Anggaran</DetailTableTh>
              <DetailTableTh align="right">Realisasi</DetailTableTh><DetailTableTh align="right">Selisih</DetailTableTh>
              <DetailTableTh align="right">% Terpakai</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row) => (
                <DetailTableRow key={row.id}>
                  <DetailTableTd>{row.name}</DetailTableTd>
                  <DetailTableTd>{row.accountName}</DetailTableTd>
                  <DetailTableTd>{row.costCenterName}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(row.budget)}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(row.actual)}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(row.variance)}</DetailTableTd>
                  <DetailTableTd align="right" className={row.percentage > 100 ? 'text-danger' : row.percentage >= 80 ? 'text-warning' : 'text-success'}>{row.percentage.toFixed(1)}%</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </ReportSection>
    </div>
  )
}
