export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { FolderKanban } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { PrintHeader } from "@/components/reports/print-header"
import { ReportDateFilter } from "@/components/reports/report-date-filter"

export default async function ProjectPnLPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  const startDate = params.startDate ? new Date(params.startDate) : new Date(now.getFullYear(), 0, 1)
  const endDate = params.endDate ? new Date(params.endDate) : now

  // Get projects with related revenue & cost data
  const projects = await prisma.project.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
    include: {
      customer: { select: { name: true } },
      customerVehicle: { select: { licensePlate: true } },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get invoices linked to projects (revenue)
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      projectId: { in: projects.map(p => p.id) },
      status: { not: 'cancelled' },
    },
    select: { projectId: true, grandTotal: true },
  })

  // Get material issues linked to projects (COGS)
  const materialIssues = await prisma.materialIssue.findMany({
    where: {
      projectId: { in: projects.map(p => p.id) },
      status: 'completed',
    },
    include: { items: true },
  })

  // Get expenses linked to projects
  const expenses = await prisma.expense.findMany({
    where: {
      projectId: { in: projects.map(p => p.id) },
      status: 'approved',
    },
    select: { projectId: true, amount: true },
  })

  // Aggregate per project
  const revenueByProject = new Map<number, number>()
  for (const inv of invoices) {
    if (inv.projectId) {
      revenueByProject.set(inv.projectId, (revenueByProject.get(inv.projectId) || 0) + Number(inv.grandTotal))
    }
  }

  const cogsByProject = new Map<number, number>()
  for (const mi of materialIssues) {
    if (mi.projectId) {
      const totalCost = mi.items.reduce((s, item) => s + Number(item.qty) * Number(item.cost), 0)
      cogsByProject.set(mi.projectId, (cogsByProject.get(mi.projectId) || 0) + totalCost)
    }
  }

  const expenseByProject = new Map<number, number>()
  for (const exp of expenses) {
    if (exp.projectId) {
      expenseByProject.set(exp.projectId, (expenseByProject.get(exp.projectId) || 0) + Number(exp.amount))
    }
  }

  const rows = projects.map(project => {
    const revenue = revenueByProject.get(project.id) || 0
    const cogs = cogsByProject.get(project.id) || 0
    const expense = expenseByProject.get(project.id) || 0
    const totalCost = cogs + expense
    const profit = revenue - totalCost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0
    const vehicle = project.customerVehicle?.licensePlate || "-"
    return {
      id: project.id,
      documentNo: project.documentNo || '-',
      name: project.name,
      customer: project.customer.name,
      vehicle,
      status: project.status,
      revenue,
      cogs,
      expense,
      totalCost,
      profit,
      margin,
    }
  })

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0)
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0)
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const period = `${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')}`

  return (
    <div className="flex flex-col gap-6">
      <PrintHeader title="Laba Rugi per Project" period={period} />
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Reports", href: "/laporan" },
        { label: "P&L by Project" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <FolderKanban size={24} />
          <h1>Laba Rugi per Project / Work Order</h1>
        </div>
        <ExportButtons title="PnL_by_Project" />
      </div>

      <ReportDateFilter defaultStartDate={startDate.toISOString().split('T')[0]} defaultEndDate={endDate.toISOString().split('T')[0]} />

      {/* KPI Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6">
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Total Pendapatan</div>
          <div className="text-xl font-bold text-success">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Total Biaya</div>
          <div className="text-xl font-bold text-danger">{formatCurrency(totalCost)}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Total Laba</div>
          <div className={`text-xl font-bold ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(totalProfit)}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Avg Margin</div>
          <div className={`text-xl font-bold ${avgMargin >= 0 ? 'text-success' : 'text-danger'}`}>{avgMargin.toFixed(1)}%</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Detail per Project</h2>
          <span className="text-sm text-muted">{rows.length} project</span>
        </div>
        <div className="p-4 px-5 overflow-x-auto">
          <DetailTable data-report-table="P&L by Project">
            <DetailTableHead>
              <DetailTableTh>No. Dok</DetailTableTh>
              <DetailTableTh>Project</DetailTableTh>
              <DetailTableTh>Customer</DetailTableTh>
              <DetailTableTh>Kendaraan</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh align="right">Pendapatan</DetailTableTh>
              <DetailTableTh align="right">Material</DetailTableTh>
              <DetailTableTh align="right">Beban</DetailTableTh>
              <DetailTableTh align="right">Laba</DetailTableTh>
              <DetailTableTh align="right">Margin</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row) => (
                <DetailTableRow key={row.id}>
                  <DetailTableTd className="font-mono text-sm">{row.documentNo}</DetailTableTd>
                  <DetailTableTd className="font-medium">{row.name}</DetailTableTd>
                  <DetailTableTd>{row.customer}</DetailTableTd>
                  <DetailTableTd className="text-sm">{row.vehicle}</DetailTableTd>
                  <DetailTableTd>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.status === 'completed' ? 'bg-success/10 text-success' : row.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-default/50 text-muted'}`}>
                      {row.status}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(row.revenue)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(row.cogs)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(row.expense)}</DetailTableTd>
                  <DetailTableTd align="right" className={row.profit >= 0 ? 'text-success font-medium' : 'text-danger font-medium'}>{formatCurrency(row.profit)}</DetailTableTd>
                  <DetailTableTd align="right" className={row.margin >= 20 ? 'text-success' : row.margin >= 0 ? 'text-warning' : 'text-danger'}>{row.margin.toFixed(1)}%</DetailTableTd>
                </DetailTableRow>
              ))}
              {rows.length === 0 && (
                <DetailTableRow><DetailTableTd colSpan={10} className="text-center text-muted py-8">Tidak ada project dalam periode ini</DetailTableTd></DetailTableRow>
              )}
              {rows.length > 0 && (
                <DetailTableRow className="font-bold border-t-2 border-default">
                  <DetailTableTd colSpan={5}>TOTAL</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(totalRevenue)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(rows.reduce((s, r) => s + r.cogs, 0))}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(rows.reduce((s, r) => s + r.expense, 0))}</DetailTableTd>
                  <DetailTableTd align="right" className={totalProfit >= 0 ? 'text-success' : 'text-danger'}>{formatCurrency(totalProfit)}</DetailTableTd>
                  <DetailTableTd align="right">{avgMargin.toFixed(1)}%</DetailTableTd>
                </DetailTableRow>
              )}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>
    </div>
  )
}
