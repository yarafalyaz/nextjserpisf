export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { sumEntriesByAccount } from "@/lib/services/report-aggregation.service"
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { computeIncomeStatement } from "@/lib/finance/income-statement"
import { FilterBar } from "./filter-bar"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laba Rugi per Pusat Biaya" }

async function getDescendantIds(ccId: number): Promise<number[]> {
  const children = await prisma.costCenter.findMany({
    where: { parentId: ccId },
    select: { id: true },
  })
  const ids = [ccId]
  for (const child of children) {
    ids.push(...(await getDescendantIds(child.id)))
  }
  return ids
}

export default async function PnLByCostCenterPage({
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

  const costCenters = await prisma.costCenter.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  })

  let selectedCC: { id: number; code?: string; name?: string } | null = null
  let summary = { totalRevenue: 0, totalCogs: 0, grossProfit: 0, totalExpense: 0, netProfit: 0, margin: 0 }
  let rows: Array<{ id: number; code: string; name: string; balance: number }> = []

  if (sp.costCenterId) {
    const ccId = Number(sp.costCenterId)
    selectedCC = costCenters.find((c) => c.id === ccId) || null
    const ccIds = await getDescendantIds(ccId)

    const [accounts, ccSums] = await Promise.all([
      prisma.account.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { code: 'asc' },
      }),
      // Totalled in SQL, filtered by the selected cost center (and descendants).
      sumEntriesByAccount({ costCenterIds: ccIds, date: { gte: startDate, lte: endDate } }),
    ])

    const result = computeIncomeStatement(
      accounts.map((acc) => ({
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        debit: ccSums.get(acc.id)?.debit ?? 0,
        credit: ccSums.get(acc.id)?.credit ?? 0,
      }))
    )

    rows = [
      ...result.revenueData.map((r) => ({ ...r, _section: 'Pendapatan' as const })),
      ...result.cogsData.map((r) => ({ ...r, _section: 'HPP' as const })),
      ...result.expenseData.map((r) => ({ ...r, _section: 'Beban' as const })),
      ...result.otherIncomeData.map((r) => ({ ...r, _section: 'Pendapatan Lain' as const })),
      ...result.otherExpenseData.map((r) => ({ ...r, _section: 'Beban Lain' as const })),
    ] as any
    summary = result
  }

  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Laba Rugi per Pusat Biaya" },
        ]} />
      </div>
      <div className="flex items-center justify-end print:hidden"><ExportButtons title="Laba_Rugi_per_Pusat_Biaya" /></div>
      <FilterBar costCenters={costCenters} />
      <ReportLetterhead title={`Laba Rugi${selectedCC ? `: ${selectedCC.code} — ${selectedCC.name}` : ''}`} subtitle="Multi-Step Income Statement" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Laba Rugi per Pusat Biaya menampilkan pendapatan, beban, dan laba/rugi yang diatribusikan ke pusat biaya tertentu beserta sub pusat biayanya." />

      {!selectedCC ? (
        <p className="text-center py-12 text-muted-foreground text-sm">Pilih pusat biaya dan periode untuk menampilkan laporan.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 print:hidden">
            <ReportKpiCard label="Pendapatan" value={formatCurrency(summary.totalRevenue)} />
            <ReportKpiCard label="HPP" value={formatCurrency(summary.totalCogs)} />
            <ReportKpiCard label="Laba Kotor" value={formatCurrency(summary.grossProfit)} />
            <ReportKpiCard label="Beban" value={formatCurrency(summary.totalExpense)} />
            <ReportKpiCard label="Laba Bersih" value={formatCurrency(summary.netProfit)} />
          </div>

          <ReportSection title="Detail Laba Rugi">
            {rows.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Tidak ada transaksi dalam periode ini untuk pusat biaya ini.</p>
            ) : (
              <>
                <DetailTable data-report-table="P&L per Cost Center">
                  <DetailTableHead>
                    <DetailTableTh>Kode</DetailTableTh>
                    <DetailTableTh>Akun</DetailTableTh>
                    <DetailTableTh align="right">Saldo</DetailTableTh>
                  </DetailTableHead>
                  <DetailTableBody>
                    {rows.map((row: any) => (
                      <DetailTableRow key={row.id}>
                        <DetailTableTd className="font-mono text-xs">{row.code}</DetailTableTd>
                        <DetailTableTd>{row.name}</DetailTableTd>
                        <DetailTableTd align="right" className={row.balance >= 0 ? 'text-success' : 'text-danger'}>{formatCurrency(row.balance)}</DetailTableTd>
                      </DetailTableRow>
                    ))}
                  </DetailTableBody>
                </DetailTable>
                <div className="border-t pt-3 mt-3 flex justify-end gap-6 text-sm">
                  <span>Pendapatan: <strong>{formatCurrency(summary.totalRevenue)}</strong></span>
                  <span>HPP: <strong>{formatCurrency(summary.totalCogs)}</strong></span>
                  <span>Beban: <strong>{formatCurrency(summary.totalExpense)}</strong></span>
                  <span className="font-bold">Laba Bersih: <strong className={summary.netProfit >= 0 ? 'text-success' : 'text-danger'}>{formatCurrency(summary.netProfit)}</strong></span>
                  <span>Margin: <strong>{summary.margin.toFixed(1)}%</strong></span>
                </div>
              </>
            )}
          </ReportSection>
        </>
      )}
    </div>
  )
}
