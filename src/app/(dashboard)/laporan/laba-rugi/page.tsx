export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { TrendingUp, DollarSign, Percent, BarChart3 } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { PrintHeader } from "@/components/reports/print-header"
import { DatePresets } from "@/components/reports/date-presets"
import { ReportDateFilter } from "@/components/reports/report-date-filter"

export default async function IncomeStatementPage({
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

  // Fetch all accounts with journal entries in period
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    include: {
      journalEntries: {
        where: {
          journal: {
            status: 'POSTED',
            transactionDate: { gte: startDate, lte: endDate },
          },
        },
      },
    },
    orderBy: { code: 'asc' },
  })

  // Categorize accounts
  const revenueAccounts = accounts.filter((a) => a.type === 'REVENUE')
  const cogsAccounts = accounts.filter((a) => a.code.startsWith('5-1'))
  const expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE' && !a.code.startsWith('5-1'))
  const otherIncomeAccounts = accounts.filter((a) => a.code.startsWith('8-'))
  const otherExpenseAccounts = accounts.filter((a) => a.code.startsWith('9-'))

  // Calculate balances
  const calcBalance = (accs: typeof accounts, isRevenue: boolean) =>
    accs.map((acc) => {
      const totalDebit = acc.journalEntries.reduce((sum, e) => sum + Number(e.debit), 0)
      const totalCredit = acc.journalEntries.reduce((sum, e) => sum + Number(e.credit), 0)
      const balance = isRevenue ? totalCredit - totalDebit : totalDebit - totalCredit
      return { id: acc.id, code: acc.code, name: acc.name, balance }
    }).filter((a) => a.balance !== 0)

  const revenueData = calcBalance(revenueAccounts, true)
  const cogsData = calcBalance(cogsAccounts, false)
  const expenseData = calcBalance(expenseAccounts, false)
  const otherIncomeData = calcBalance(otherIncomeAccounts, true)
  const otherExpenseData = calcBalance(otherExpenseAccounts, false)

  const totalRevenue = revenueData.reduce((sum, a) => sum + a.balance, 0)
  const totalCogs = cogsData.reduce((sum, a) => sum + a.balance, 0)
  const grossProfit = totalRevenue - totalCogs
  const totalExpense = expenseData.reduce((sum, a) => sum + a.balance, 0)
  const operatingProfit = grossProfit - totalExpense
  const totalOtherIncome = otherIncomeData.reduce((sum, a) => sum + a.balance, 0)
  const totalOtherExpense = otherExpenseData.reduce((sum, a) => sum + a.balance, 0)
  const totalOther = totalOtherIncome - totalOtherExpense
  const netProfit = operatingProfit + totalOther
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  const hasCogs = cogsData.length > 0
  const hasOther = otherIncomeData.length > 0 || otherExpenseData.length > 0

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Reports", href: "/laporan" },
        { label: "Income Statement" },
      ]} />

      <div className="flex items-center gap-2">
        <TrendingUp size={24} />
        <h1 className="text-2xl font-bold text-foreground">Laporan Laba Rugi</h1>
      </div>

      <ReportDateFilter defaultStartDate={startDate.toISOString().split("T")[0]} defaultEndDate={endDate.toISOString().split("T")[0]} />












      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <DollarSign size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted">Total Pendapatan</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(totalRevenue)}</p>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-success/10">
            <BarChart3 size={20} className="text-success" />
          </div>
          <div>
            <p className="text-xs text-muted">Laba Kotor</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(grossProfit)}</p>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-info/10">
            <TrendingUp size={20} className="text-info" />
          </div>
          <div>
            <p className="text-xs text-muted">Laba Bersih</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(netProfit)}</p>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-warning/10">
            <Percent size={20} className="text-warning" />
          </div>
          <div>
            <p className="text-xs text-muted">Margin</p>
            <p className="text-sm font-semibold text-foreground">{margin.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Income Statement Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Laporan Laba Rugi Multi-Step</h2>
          <p className="text-xs text-muted">
            {startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} - {endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="p-4 px-5">
          <div className="overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Kode</DetailTableTh>
                <DetailTableTh>Nama Akun</DetailTableTh>
                <DetailTableTh align="right">Jumlah</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {/* Revenue Section */}
                <DetailTableRow>
                  <DetailTableTd colSpan={3} className="font-bold bg-muted/30">PENDAPATAN USAHA</DetailTableTd>
                </DetailTableRow>
                {revenueData.map((acc) => (
                  <DetailTableRow key={acc.id}>
                    <DetailTableTd>{acc.code}</DetailTableTd>
                    <DetailTableTd>{acc.name}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(acc.balance)}</DetailTableTd>
                  </DetailTableRow>
                ))}
                <DetailTableRow>
                  <DetailTableTd colSpan={2} className="font-semibold">Total Pendapatan</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatCurrency(totalRevenue)}</DetailTableTd>
                </DetailTableRow>

                {/* COGS Section */}
                {hasCogs && (
                  <>
                    <DetailTableRow>
                      <DetailTableTd colSpan={3} className="font-bold bg-muted/30">HARGA POKOK PENJUALAN</DetailTableTd>
                    </DetailTableRow>
                    {cogsData.map((acc) => (
                      <DetailTableRow key={acc.id}>
                        <DetailTableTd>{acc.code}</DetailTableTd>
                        <DetailTableTd>{acc.name}</DetailTableTd>
                        <DetailTableTd align="right">{formatCurrency(acc.balance)}</DetailTableTd>
                      </DetailTableRow>
                    ))}
                    <DetailTableRow>
                      <DetailTableTd colSpan={2} className="font-semibold">Total HPP</DetailTableTd>
                      <DetailTableTd align="right" className="font-semibold">{formatCurrency(totalCogs)}</DetailTableTd>
                    </DetailTableRow>
                  </>
                )}

                {/* Gross Profit */}
                <DetailTableRow>
                  <DetailTableTd colSpan={2} className="font-bold text-primary">LABA KOTOR</DetailTableTd>
                  <DetailTableTd align="right" className="font-bold text-primary">{formatCurrency(grossProfit)}</DetailTableTd>
                </DetailTableRow>

                {/* Operating Expenses */}
                <DetailTableRow>
                  <DetailTableTd colSpan={3} className="font-bold bg-muted/30">BEBAN OPERASIONAL</DetailTableTd>
                </DetailTableRow>
                {expenseData.map((acc) => (
                  <DetailTableRow key={acc.id}>
                    <DetailTableTd>{acc.code}</DetailTableTd>
                    <DetailTableTd>{acc.name}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(acc.balance)}</DetailTableTd>
                  </DetailTableRow>
                ))}
                <DetailTableRow>
                  <DetailTableTd colSpan={2} className="font-semibold">Total Beban Operasional</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatCurrency(totalExpense)}</DetailTableTd>
                </DetailTableRow>

                {/* Operating Profit */}
                <DetailTableRow>
                  <DetailTableTd colSpan={2} className="font-bold text-primary">LABA OPERASIONAL</DetailTableTd>
                  <DetailTableTd align="right" className="font-bold text-primary">{formatCurrency(operatingProfit)}</DetailTableTd>
                </DetailTableRow>

                {/* Other Income/Expense */}
                {hasOther && (
                  <>
                    <DetailTableRow>
                      <DetailTableTd colSpan={3} className="font-bold bg-muted/30">PENDAPATAN / BEBAN LAIN-LAIN</DetailTableTd>
                    </DetailTableRow>
                    {otherIncomeData.map((acc) => (
                      <DetailTableRow key={acc.id}>
                        <DetailTableTd>{acc.code}</DetailTableTd>
                        <DetailTableTd>{acc.name}</DetailTableTd>
                        <DetailTableTd align="right">{formatCurrency(acc.balance)}</DetailTableTd>
                      </DetailTableRow>
                    ))}
                    {otherExpenseData.map((acc) => (
                      <DetailTableRow key={acc.id}>
                        <DetailTableTd>{acc.code}</DetailTableTd>
                        <DetailTableTd>{acc.name}</DetailTableTd>
                        <DetailTableTd align="right">({formatCurrency(acc.balance)})</DetailTableTd>
                      </DetailTableRow>
                    ))}
                    <DetailTableRow>
                      <DetailTableTd colSpan={2} className="font-semibold">Total Lain-lain</DetailTableTd>
                      <DetailTableTd align="right" className="font-semibold">{formatCurrency(totalOther)}</DetailTableTd>
                    </DetailTableRow>
                  </>
                )}

                {/* Net Profit */}
                <DetailTableRow>
                  <DetailTableTd colSpan={2} className="font-bold text-lg text-primary">LABA BERSIH SEBELUM PAJAK</DetailTableTd>
                  <DetailTableTd align="right" className="font-bold text-lg text-primary">{formatCurrency(netProfit)}</DetailTableTd>
                </DetailTableRow>
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      </div>
    </div>
  )
}
