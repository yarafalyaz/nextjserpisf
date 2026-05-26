export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { Wallet } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Wallet size={24} />
          <h1>Laporan Arus Kas</h1>
        </div>
        <p>
          Periode: {startDate.toLocaleDateString('id-ID')} - {endDate.toLocaleDateString('id-ID')}
        </p>
      </div>

      <form style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label htmlFor="startDate">Dari:</label>
        <input
          type="date"
          id="startDate"
          name="startDate"
          defaultValue={params.startDate || startDate.toISOString().split('T')[0]}
        />
        <label htmlFor="endDate">Sampai:</label>
        <input
          type="date"
          id="endDate"
          name="endDate"
          defaultValue={params.endDate || endDate.toISOString().split('T')[0]}
        />
        <button type="submit">Generate</button>
      </form>

      {/* KPI Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xl font-bold text-foreground" style={{ color: 'var(--color-success, green)' }}>
            {formatCurrency(totalInflow)}
          </div>
          <div className="text-[0.8125rem] text-muted font-medium">Total Penerimaan Kas</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xl font-bold text-foreground" style={{ color: 'var(--color-danger, red)' }}>
            {formatCurrency(totalOutflow)}
          </div>
          <div className="text-[0.8125rem] text-muted font-medium">Total Pengeluaran Kas</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xl font-bold text-foreground" style={{ color: netCashFlow >= 0 ? 'var(--color-success, green)' : 'var(--color-danger, red)' }}>
            {formatCurrency(netCashFlow)}
          </div>
          <div className="text-[0.8125rem] text-muted font-medium">Arus Kas Bersih</div>
        </div>
      </div>

      {/* Cash Accounts */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden" style={{ marginBottom: '1.5rem' }}>
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Akun Kas/Bank</h2>
        </div>
        <div className="p-4 px-5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Akun</th>
              </tr>
            </thead>
            <tbody>
              {cashAccounts.map((acc) => (
                <tr key={acc.id}>
                  <td>{acc.code}</td>
                  <td>{acc.name}</td>
                </tr>
              ))}
              {cashAccounts.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ textAlign: 'center' }}>Tidak ada akun kas/bank ditemukan</td>
                </tr>
              )}
            </tbody>
          </table>
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
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th>Bulan</th>
                    <th style={{ textAlign: 'right' }}>Penerimaan</th>
                    <th style={{ textAlign: 'right' }}>Pengeluaran</th>
                    <th style={{ textAlign: 'right' }}>Arus Bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMonths.map(([month, data]) => (
                    <tr key={month}>
                      <td>{month}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(data.inflow)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(data.outflow)}</td>
                      <td style={{ textAlign: 'right', color: data.inflow - data.outflow >= 0 ? 'var(--color-success, green)' : 'var(--color-danger, red)' }}>
                        {formatCurrency(data.inflow - data.outflow)}
                      </td>
                    </tr>
                  ))}
                  {sortedMonths.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center' }}>Tidak ada data arus kas pada periode ini</td>
                    </tr>
                  )}
                  {sortedMonths.length > 0 && (
                    <tr style={{ fontWeight: 'bold' }}>
                      <td>Total</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(totalInflow)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(totalOutflow)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(netCashFlow)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
