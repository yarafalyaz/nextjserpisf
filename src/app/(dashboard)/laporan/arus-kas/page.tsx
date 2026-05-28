export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { Wallet } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportDateFilter } from "@/components/reports/report-date-filter"

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = params.endDate ? new Date(params.endDate) : now

  // Get all cash/bank accounts
  const cashAccounts = await prisma.account.findMany({
    where: {
      type: 'ASSET',
      OR: [
        { code: { startsWith: '1-1' } },
        { name: { contains: 'kas' } },
        { name: { contains: 'bank' } },
        { name: { contains: 'cash' } },
      ],
    },
  })

  const cashAccountIds = cashAccounts.map((a) => a.id)

  // Get journal entries for these accounts within date range
  const entries = await prisma.journalEntry.findMany({
    where: {
      accountId: { in: cashAccountIds },
      journal: {
        status: 'POSTED',
        transactionDate: { gte: startDate, lte: endDate },
      },
    },
    include: { journal: true, account: true },
    orderBy: { journal: { transactionDate: 'desc' } },
  })

  // Calculate totals
  let totalInflow = 0
  let totalOutflow = 0

  // Group by month
  const monthlyData = new Map<string, { inflow: number; outflow: number }>()

  for (const entry of entries) {
    const debit = Number(entry.debit)
    const credit = Number(entry.credit)
    const date = entry.journal.transactionDate
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    const existing = monthlyData.get(monthKey) || { inflow: 0, outflow: 0 }

    // Debit to cash = inflow, Credit from cash = outflow
    existing.inflow += debit
    existing.outflow += credit
    totalInflow += debit
    totalOutflow += credit

    monthlyData.set(monthKey, existing)
  }

  const netCashFlow = totalInflow - totalOutflow

  const sortedMonths = Array.from(monthlyData.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Reports", href: "/reports" },
  { label: "Cash Flow" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Wallet size={24} />
          <h1>Laporan Arus Kas</h1>
        <ExportButtons title="Cash_Flow" />
        </div>
        <p>
          Periode: {startDate.toLocaleDateString('id-ID')} - {endDate.toLocaleDateString('id-ID')}
        </p>
      </div>

      <ReportDateFilter defaultStartDate={startDate.toISOString().split('T')[0]} defaultEndDate={endDate.toISOString().split('T')[0]} />

      {/* KPI Summary */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-6">
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xl font-bold text-success">
            {formatCurrency(totalInflow)}
          </div>
          <div className="text-[0.8125rem] text-muted font-medium">Total Penerimaan Kas</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xl font-bold text-danger">
            {formatCurrency(totalOutflow)}
          </div>
          <div className="text-[0.8125rem] text-muted font-medium">Total Pengeluaran Kas</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className={`text-xl font-bold ${netCashFlow >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(netCashFlow)}
          </div>
          <div className="text-[0.8125rem] text-muted font-medium">Arus Kas Bersih</div>
        </div>
      </div>

      {/* Cash Accounts */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Akun Kas/Bank</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Kode</DetailTableTh>
              <DetailTableTh>Nama Akun</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {cashAccounts.map((acc) => (
                <DetailTableRow key={acc.id}>
                  <DetailTableTd>{acc.code}</DetailTableTd>
                  <DetailTableTd>{acc.name}</DetailTableTd>
                </DetailTableRow>
              ))}
              {cashAccounts.length === 0 && (
                <DetailTableRow>
                  <DetailTableTd colSpan={2} className="text-center">Tidak ada akun kas/bank ditemukan</DetailTableTd>
                </DetailTableRow>
              )}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Arus Kas per Bulan</h2>
        </div>
        <div className="p-4 px-5">
          <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>Bulan</DetailTableTh>
                  <DetailTableTh align="right">Penerimaan</DetailTableTh>
                  <DetailTableTh align="right">Pengeluaran</DetailTableTh>
                  <DetailTableTh align="right">Arus Bersih</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {sortedMonths.map(([month, data]) => (
                    <DetailTableRow key={month}>
                      <DetailTableTd>{month}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(data.inflow)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(data.outflow)}</DetailTableTd>
                      <DetailTableTd align="right" className={data.inflow - data.outflow >= 0 ? "text-success" : "text-danger"}>
                        {formatCurrency(data.inflow - data.outflow)}
                      </DetailTableTd>
                    </DetailTableRow>
                  ))}
                  {sortedMonths.length === 0 && (
                    <DetailTableRow>
                      <DetailTableTd colSpan={4} className="text-center">Tidak ada data arus kas pada periode ini</DetailTableTd>
                    </DetailTableRow>
                  )}
                  {sortedMonths.length > 0 && (
                    <DetailTableRow className="font-bold">
                      <DetailTableTd>Total</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(totalInflow)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(totalOutflow)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(netCashFlow)}</DetailTableTd>
                    </DetailTableRow>
                  )}
                </DetailTableBody>
              </DetailTable>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
