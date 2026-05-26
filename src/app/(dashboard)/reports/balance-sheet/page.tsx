export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { BarChart3 } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

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
        <div className="flex items-center gap-2">
          <BarChart3 size={24} />
          <h1>Neraca (Balance Sheet)</h1>
        </div>
        <p>Per tanggal: {asOfDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <form className="mb-6 flex items-center gap-3">
        <label htmlFor="date">Tanggal:</label>
        <input
          type="date"
          id="date"
          name="date"
          defaultValue={params.date || asOfDate.toISOString().split('T')[0]}
        />
        <button type="submit" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Generate</button>
      </form>

      {/* ASET */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">ASET</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Kode</DetailTableTh>
              <DetailTableTh>Nama Akun</DetailTableTh>
              <DetailTableTh align="right">Saldo</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {assets.map((a) => (
                <DetailTableRow key={a.code}>
                  <DetailTableTd>{a.code}</DetailTableTd>
                  <DetailTableTd>{a.name}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(a.balance)}</DetailTableTd>
                </DetailTableRow>
              ))}
              <DetailTableRow className="font-bold">
                <DetailTableTd colSpan={2}>Total Aset</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(totalAssets)}</DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* KEWAJIBAN */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">KEWAJIBAN</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Kode</DetailTableTh>
              <DetailTableTh>Nama Akun</DetailTableTh>
              <DetailTableTh align="right">Saldo</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {liabilities.map((a) => (
                <DetailTableRow key={a.code}>
                  <DetailTableTd>{a.code}</DetailTableTd>
                  <DetailTableTd>{a.name}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(a.balance)}</DetailTableTd>
                </DetailTableRow>
              ))}
              <DetailTableRow className="font-bold">
                <DetailTableTd colSpan={2}>Total Kewajiban</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(totalLiabilities)}</DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* EKUITAS */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">EKUITAS</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Kode</DetailTableTh>
              <DetailTableTh>Nama Akun</DetailTableTh>
              <DetailTableTh align="right">Saldo</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {equity.map((a) => (
                <DetailTableRow key={a.code}>
                  <DetailTableTd>{a.code}</DetailTableTd>
                  <DetailTableTd>{a.name}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(a.balance)}</DetailTableTd>
                </DetailTableRow>
              ))}
              <DetailTableRow className="font-bold">
                <DetailTableTd colSpan={2}>Total Ekuitas</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(totalEquity)}</DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Balance Check */}
      <div className={`bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md ${isBalanced ? "border-success" : "border-danger"}`}>
        <div className={`text-xl font-bold ${isBalanced ? "text-success" : "text-danger"}`}>
          {isBalanced ? 'SEIMBANG' : 'TIDAK SEIMBANG'}
        </div>
        <div className="text-[0.8125rem] text-muted font-medium">
          Aset: {formatCurrency(totalAssets)} | Kewajiban + Ekuitas: {formatCurrency(totalLiabilities + totalEquity)}
        </div>
      </div>
    </div>
  )
}
