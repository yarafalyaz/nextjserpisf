export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatAccounting } from '@/lib/utils/format'
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportSection } from "@/components/reports/report-section"
import { statusLabel } from "@/lib/utils/status-labels"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laba Rugi Proyek" }

export default async function ProjectPnLPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')

  const { start: startDate, end: endDate } = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))
  endDate.setHours(23, 59, 59, 999)

  const [invoices, materialIssues, expenses, pettyOut, vendorBills] = await Promise.all([
    // Revenue recognised on the invoice = subtotal − discount (excl. tax), i.e.
    // what the customer actually owes net of any header discount. Using bare
    // `subtotal` overstated project revenue whenever a discount was applied.
    prisma.salesInvoice.findMany({
      where: { projectId: { not: null }, status: { in: ['posted', 'partial', 'paid'] }, date: { gte: startDate, lte: endDate } },
      select: { projectId: true, subtotal: true, discount: true },
    }),
    prisma.materialIssue.findMany({
      where: { projectId: { not: null }, status: 'completed', date: { gte: startDate, lte: endDate } },
      include: { items: true },
    }),
    prisma.expense.findMany({
      where: { projectId: { not: null }, status: 'approved', date: { gte: startDate, lte: endDate } },
      select: { projectId: true, amount: true },
    }),
    // Kas kecil KELUAR berproyek (bayar coating/bending tunai, upah harian
    // tunai): PettyCash tanpa status, jadi saring type OUT saja.
    prisma.pettyCash.findMany({
      where: { projectId: { not: null }, type: 'OUT', date: { gte: startDate, lte: endDate } },
      select: { projectId: true, amount: true },
    }),
    // Tagihan vendor berproyek (jasa maklon coating/bending): hitung saat
    // confirmed/posted/partial/paid — draft belum beban.
    prisma.vendorBill.findMany({
      where: { projectId: { not: null }, status: { in: ['confirmed', 'posted', 'partial', 'paid'] }, date: { gte: startDate, lte: endDate } },
      select: { projectId: true, grandTotal: true },
    }),
  ])

  const revenueByProject = new Map<number, number>()
  for (const inv of invoices) {
    if (inv.projectId) {
      const netRevenue = Number(inv.subtotal) - Number(inv.discount)
      revenueByProject.set(inv.projectId, (revenueByProject.get(inv.projectId) || 0) + netRevenue)
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
    if (exp.projectId) expenseByProject.set(exp.projectId, (expenseByProject.get(exp.projectId) || 0) + Number(exp.amount))
  }
  // Kas kecil keluar berproyek + tagihan vendor berproyek = beban proyek juga
  // (sebelumnya tak dihitung sehingga HPP understated).
  const pettyByProject = new Map<number, number>()
  for (const pc of pettyOut) {
    if (pc.projectId) pettyByProject.set(pc.projectId, (pettyByProject.get(pc.projectId) || 0) + Number(pc.amount))
  }
  const billByProject = new Map<number, number>()
  for (const bill of vendorBills) {
    if (bill.projectId) billByProject.set(bill.projectId, (billByProject.get(bill.projectId) || 0) + Number(bill.grandTotal))
  }

  const activeProjectIds = [...new Set<number>([...revenueByProject.keys(), ...cogsByProject.keys(), ...expenseByProject.keys(), ...pettyByProject.keys(), ...billByProject.keys()])]

  const projects = activeProjectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: activeProjectIds } },
        include: { customer: { select: { name: true } }, customerVehicle: { select: { plateNumber: true } } },
        orderBy: { createdAt: 'desc' },
      })
    : []

  const rows = projects.map(project => {
    const revenue = revenueByProject.get(project.id) || 0
    const cogs = cogsByProject.get(project.id) || 0
    // Beban = expense approved + kas kecil keluar + tagihan vendor jasa.
    const expense = (expenseByProject.get(project.id) || 0) + (pettyByProject.get(project.id) || 0) + (billByProject.get(project.id) || 0)
    const totalCost = cogs + expense
    const profit = revenue - totalCost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0
    const vehicle = project.customerVehicle?.plateNumber || "-"
    return { id: project.id, documentNo: project.documentNo || '-', name: project.name, customer: project.customer.name,
      vehicle, status: project.status, revenue, cogs, expense, totalCost, profit, margin }
  })

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0)
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <ReportPageShell
      title="Laba Rugi per Proyek"
      sheetTitle="Laba Rugi per Proyek / Perintah Kerja"
      subtitle="Rincian Pendapatan, Biaya, dan Laba per Proyek"
      periodLabel={periodLabel}
      periodCaption={periodLabel}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/laba-rugi-proyek"
          mode="range"
          defaultStartDate={toLocalDateOnly(startDate)}
          defaultEndDate={toLocalDateOnly(endDate)}
        />
      }
      actions={<ExportButtons title="Laba_Rugi_per_Proyek" />}
    >
      <ReportSection title={`Detail per Proyek (${rows.length} proyek)`}>
        <DetailTable data-report-table="Laba Rugi per Proyek">
          <DetailTableHead>
            <DetailTableTh>No. Dok</DetailTableTh><DetailTableTh>Proyek</DetailTableTh><DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh>Kendaraan</DetailTableTh><DetailTableTh>Status</DetailTableTh>
            <DetailTableTh align="right">Pendapatan</DetailTableTh><DetailTableTh align="right">Material</DetailTableTh>
            <DetailTableTh align="right">Beban</DetailTableTh><DetailTableTh align="right">Laba</DetailTableTh><DetailTableTh align="right">Margin</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.id}>
                <DetailTableTd className="font-mono text-sm">{row.documentNo}</DetailTableTd>
                <DetailTableTd className="font-medium">{row.name}</DetailTableTd>
                <DetailTableTd>{row.customer}</DetailTableTd>
                <DetailTableTd className="text-sm">{row.vehicle}</DetailTableTd>
                <DetailTableTd>{statusLabel(row.status)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.revenue)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.cogs)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.expense)}</DetailTableTd>
                <DetailTableTd align="right" className={row.profit >= 0 ? 'text-success font-medium' : 'text-danger font-medium'}>{formatAccounting(row.profit)}</DetailTableTd>
                <DetailTableTd align="right" className={row.margin >= 20 ? 'text-success' : row.margin >= 0 ? 'text-warning' : 'text-danger'}>{row.margin.toFixed(1)}%</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={10} className="text-center text-muted-foreground py-8">Tidak ada proyek dalam periode ini</DetailTableTd></DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={5}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalRevenue)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(rows.reduce((s, r) => s + r.cogs, 0))}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(rows.reduce((s, r) => s + r.expense, 0))}</DetailTableTd>
                <DetailTableTd align="right" className={totalProfit >= 0 ? 'text-success' : 'text-danger'}>{formatAccounting(totalProfit)}</DetailTableTd>
                <DetailTableTd align="right">{avgMargin.toFixed(1)}%</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
