export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { Scale } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams
  const asOfDate = params.date ? new Date(params.date) : new Date()

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    include: {
      journalEntries: {
        where: {
          journal: {
            status: 'POSTED',
            transactionDate: { lte: asOfDate },
          },
        },
      },
    },
    orderBy: { code: 'asc' },
  })

  const data = accounts
    .map((acc) => ({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      totalDebit: acc.journalEntries.reduce((sum, e) => sum + Number(e.debit), 0),
      totalCredit: acc.journalEntries.reduce((sum, e) => sum + Number(e.credit), 0),
    }))
    .filter((a) => a.totalDebit > 0 || a.totalCredit > 0)

  const grandTotalDebit = data.reduce((sum, a) => sum + a.totalDebit, 0)
  const grandTotalCredit = data.reduce((sum, a) => sum + a.totalCredit, 0)
  const isBalanced = Math.abs(grandTotalDebit - grandTotalCredit) < 0.01

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Reports", href: "/reports" },
  { label: "Trial Balance" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Scale size={24} />
          <h1>Neraca Saldo (Trial Balance)</h1>
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

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Daftar Neraca Saldo</h2>
        </div>
        <div className="p-4 px-5">
          <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th>Kode Akun</th>
                    <th>Nama Akun</th>
                    <th>Tipe</th>
                    <th style={{ textAlign: 'right' }}>Total Debit</th>
                    <th style={{ textAlign: 'right' }}>Total Kredit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((acc) => (
                    <tr key={acc.id}>
                      <td>{acc.code}</td>
                      <td>{acc.name}</td>
                      <td>{acc.type}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(acc.totalDebit)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(acc.totalCredit)}</td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center' }}>Tidak ada data jurnal yang sudah diposting</td>
                    </tr>
                  )}
                </tbody>
                {data.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 'bold' }}>
                      <td colSpan={3}>TOTAL</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(grandTotalDebit)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(grandTotalCredit)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Balance Check */}
      <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ marginTop: '1.5rem', borderColor: isBalanced ? 'var(--color-success, green)' : 'var(--color-danger, red)' }}>
        <div className="text-xl font-bold text-foreground" style={{ color: isBalanced ? 'var(--color-success, green)' : 'var(--color-danger, red)' }}>
          {isBalanced ? 'SEIMBANG' : 'TIDAK SEIMBANG'}
        </div>
        <div className="text-[0.8125rem] text-muted font-medium">
          Total Debit: {formatCurrency(grandTotalDebit)} | Total Kredit: {formatCurrency(grandTotalCredit)}
        </div>
      </div>
    </div>
  )
}
