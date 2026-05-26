export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { Building2 } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ProfitCenterIncomePage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(now.getFullYear(), 0, 1)
  const endDate = params.endDate ? new Date(params.endDate) : now

  // Get profit centers
  const profitCenters = await prisma.profitCenter.findMany({ orderBy: { code: 'asc' } })

  // Get revenue entries
  const revenueEntries = await prisma.journalEntry.findMany({
    where: {
      account: { type: 'REVENUE' },
      journal: {
        status: 'POSTED',
        transactionDate: { gte: startDate, lte: endDate },
      },
    },
    include: { account: true },
  })

  // Get expense entries
  const expenseEntries = await prisma.journalEntry.findMany({
    where: {
      account: { type: 'EXPENSE' },
      journal: {
        status: 'POSTED',
        transactionDate: { gte: startDate, lte: endDate },
      },
    },
    include: { account: true },
  })

  // Aggregate revenue by account
  const revenueByAccount = new Map<number, { code: string; name: string; amount: number }>()
  for (const entry of revenueEntries) {
    const existing = revenueByAccount.get(entry.accountId) || {
      code: entry.account.code,
      name: entry.account.name,
      amount: 0,
    }
    existing.amount += Number(entry.credit) - Number(entry.debit)
    revenueByAccount.set(entry.accountId, existing)
  }

  // Aggregate expenses by account
  const expenseByAccount = new Map<number, { code: string; name: string; amount: number }>()
  for (const entry of expenseEntries) {
    const existing = expenseByAccount.get(entry.accountId) || {
      code: entry.account.code,
      name: entry.account.name,
      amount: 0,
    }
    existing.amount += Number(entry.debit) - Number(entry.credit)
    expenseByAccount.set(entry.accountId, existing)
  }

  const revenueItems = Array.from(revenueByAccount.values())
    .filter((r) => r.amount !== 0)
    .sort((a, b) => a.code.localeCompare(b.code))
  const expenseItems = Array.from(expenseByAccount.values())
    .filter((e) => e.amount !== 0)
    .sort((a, b) => a.code.localeCompare(b.code))

  const totalRevenue = revenueItems.reduce((sum, r) => sum + r.amount, 0)
  const totalExpense = expenseItems.reduce((sum, e) => sum + e.amount, 0)
  const netIncome = totalRevenue - totalExpense

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Reports", href: "/reports" },
  { label: "Profit Center Income" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Building2 size={24} />
          <h1>Laporan Laba Rugi per Profit Center</h1>
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

      {/* Profit Centers List */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden" style={{ marginBottom: '1.5rem' }}>
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Daftar Profit Center</h2>
        </div>
        <div className="p-4 px-5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama</th>
              </tr>
            </thead>
            <tbody>
              {profitCenters.map((pc) => (
                <tr key={pc.id}>
                  <td>{pc.code}</td>
                  <td>{pc.name}</td>
                </tr>
              ))}
              {profitCenters.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ textAlign: 'center' }}>Belum ada profit center</td>
                </tr>
              )}
            </tbody>
          </table>
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--color-text-muted, #6b7280)' }}>
            Alokasi per profit center akan tersedia setelah jurnal dihubungkan ke profit center.
          </p>
        </div>
      </div>

      {/* KPI Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xl font-bold text-foreground" style={{ color: 'var(--color-success, green)' }}>
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-[0.8125rem] text-muted font-medium">Total Pendapatan</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xl font-bold text-foreground" style={{ color: 'var(--color-danger, red)' }}>
            {formatCurrency(totalExpense)}
          </div>
          <div className="text-[0.8125rem] text-muted font-medium">Total Beban</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xl font-bold text-foreground" style={{ color: netIncome >= 0 ? 'var(--color-success, green)' : 'var(--color-danger, red)' }}>
            {formatCurrency(netIncome)}
          </div>
          <div className="text-[0.8125rem] text-muted font-medium">Laba (Rugi) Bersih</div>
        </div>
      </div>

      {/* Revenue Section */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden" style={{ marginBottom: '1.5rem' }}>
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">PENDAPATAN</h2>
        </div>
        <div className="p-4 px-5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Akun</th>
                <th style={{ textAlign: 'right' }}>Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {revenueItems.map((r) => (
                <tr key={r.code}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(r.amount)}</td>
                </tr>
              ))}
              {revenueItems.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center' }}>Tidak ada data pendapatan</td>
                </tr>
              )}
              <tr style={{ fontWeight: 'bold' }}>
                <td colSpan={2}>Total Pendapatan</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(totalRevenue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Expense Section */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden" style={{ marginBottom: '1.5rem' }}>
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">BEBAN</h2>
        </div>
        <div className="p-4 px-5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Akun</th>
                <th style={{ textAlign: 'right' }}>Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {expenseItems.map((e) => (
                <tr key={e.code}>
                  <td>{e.code}</td>
                  <td>{e.name}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(e.amount)}</td>
                </tr>
              ))}
              {expenseItems.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center' }}>Tidak ada data beban</td>
                </tr>
              )}
              <tr style={{ fontWeight: 'bold' }}>
                <td colSpan={2}>Total Beban</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(totalExpense)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Net Income */}
      <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className="text-xl font-bold text-foreground" style={{ color: netIncome >= 0 ? 'var(--color-success, green)' : 'var(--color-danger, red)' }}>
          {formatCurrency(netIncome)}
        </div>
        <div className="text-[0.8125rem] text-muted font-medium">Laba (Rugi) Bersih Keseluruhan</div>
      </div>
    </div>
  )
}
