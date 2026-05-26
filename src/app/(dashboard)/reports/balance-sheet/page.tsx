export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { BarChart3 } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams
  const asOfDate = params.date ? new Date(params.date) : new Date()

  const entries = await prisma.journalEntry.findMany({
    where: {
      journal: {
        status: 'POSTED',
        transactionDate: { lte: asOfDate },
      },
    },
    include: { account: true },
  })

  // Aggregate by account
  const accountBalances = new Map<number, { name: string; code: string; type: string; balance: number }>()
  for (const entry of entries) {
    const existing = accountBalances.get(entry.accountId) || {
      name: entry.account.name,
      code: entry.account.code,
      type: entry.account.type,
      balance: 0,
    }
    if (entry.account.type === 'ASSET') {
      existing.balance += Number(entry.debit) - Number(entry.credit)
    } else {
      existing.balance += Number(entry.credit) - Number(entry.debit)
    }
    accountBalances.set(entry.accountId, existing)
  }

  const assets: { name: string; code: string; balance: number }[] = []
  const liabilities: { name: string; code: string; balance: number }[] = []
  const equity: { name: string; code: string; balance: number }[] = []

  for (const [, acc] of accountBalances) {
    if (acc.balance === 0) continue
    const item = { name: acc.name, code: acc.code, balance: acc.balance }
    if (acc.type === 'ASSET') assets.push(item)
    else if (acc.type === 'LIABILITY') liabilities.push(item)
    else if (acc.type === 'EQUITY') equity.push(item)
  }

  assets.sort((a, b) => a.code.localeCompare(b.code))
  liabilities.sort((a, b) => a.code.localeCompare(b.code))
  equity.sort((a, b) => a.code.localeCompare(b.code))

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0)
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0)
  const isBalanced = Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Reports", href: "/reports" },
  { label: "Balance Sheet" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BarChart3 size={24} />
          <h1>Neraca (Balance Sheet)</h1>
        </div>
        <p>Per tanggal: {asOfDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <form style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <label htmlFor="date">Tanggal:</label>
        <input
          type="date"
          id="date"
          name="date"
          defaultValue={params.date || asOfDate.toISOString().split('T')[0]}
        />
        <button type="submit">Generate</button>
      </form>

      {/* ASET */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden" style={{ marginBottom: '1.5rem' }}>
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">ASET</h2>
        </div>
        <div className="p-4 px-5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Akun</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.code}>
                  <td>{a.code}</td>
                  <td>{a.name}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(a.balance)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 'bold' }}>
                <td colSpan={2}>Total Aset</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(totalAssets)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* KEWAJIBAN */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden" style={{ marginBottom: '1.5rem' }}>
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">KEWAJIBAN</h2>
        </div>
        <div className="p-4 px-5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Akun</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {liabilities.map((a) => (
                <tr key={a.code}>
                  <td>{a.code}</td>
                  <td>{a.name}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(a.balance)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 'bold' }}>
                <td colSpan={2}>Total Kewajiban</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(totalLiabilities)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* EKUITAS */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden" style={{ marginBottom: '1.5rem' }}>
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">EKUITAS</h2>
        </div>
        <div className="p-4 px-5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Akun</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {equity.map((a) => (
                <tr key={a.code}>
                  <td>{a.code}</td>
                  <td>{a.name}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(a.balance)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 'bold' }}>
                <td colSpan={2}>Total Ekuitas</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(totalEquity)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Balance Check */}
      <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ borderColor: isBalanced ? 'var(--color-success, green)' : 'var(--color-danger, red)' }}>
        <div className="text-xl font-bold text-foreground" style={{ color: isBalanced ? 'var(--color-success, green)' : 'var(--color-danger, red)' }}>
          {isBalanced ? 'SEIMBANG' : 'TIDAK SEIMBANG'}
        </div>
        <div className="text-[0.8125rem] text-muted font-medium">
          Aset: {formatCurrency(totalAssets)} | Kewajiban + Ekuitas: {formatCurrency(totalLiabilities + totalEquity)}
        </div>
      </div>
    </div>
  )
}
