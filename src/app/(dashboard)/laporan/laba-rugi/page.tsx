export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { DollarSign, Percent, BarChart3, TrendingUp } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportDateFilter } from "@/components/reports/report-date-filter"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { computeIncomeStatement } from "@/lib/finance/income-statement"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laba Rugi" }

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  const startDate = params.tanggalMulai
    ? new Date(params.tanggalMulai)
    : new Date(now.getFullYear(), 0, 1)
  const endDate = params.tanggalSelesai ? new Date(params.tanggalSelesai) : now
  endDate.setHours(23, 59, 59, 999)

  // Fetch all accounts with journal entries in period
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    include: {
      journalEntries: {
        where: {
          journal: {
            status: { in: ['POSTED', 'REVERSED'] },
            transactionDate: { gte: startDate, lte: endDate },
          },
        },
      },
    },
    orderBy: { code: 'asc' },
  })

  // Categorize + multi-step P&L math lives in computeIncomeStatement (unit-tested).
  const {
    revenueData, cogsData, expenseData, otherIncomeData, otherExpenseData,
    totalRevenue, totalCogs, grossProfit, totalExpense, operatingProfit,
    totalOther, netProfit, margin,
  } = computeIncomeStatement(
    accounts.map((acc) => {
      const totalDebit = acc.journalEntries.reduce((sum, e) => sum + Number(e.debit), 0)
      const totalCredit = acc.journalEntries.reduce((sum, e) => sum + Number(e.credit), 0)
      return { id: acc.id, code: acc.code, name: acc.name, type: acc.type, debit: totalDebit, credit: totalCredit }
    })
  )

  const hasCogs = cogsData.length > 0
  const hasOther = otherIncomeData.length > 0 || otherExpenseData.length > 0

  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Laba Rugi" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Laba Rugi" />
      </div>

      <div className="print:hidden">
        <ReportDateFilter defaultStartDate={startDate.toISOString().split("T")[0]} defaultEndDate={endDate.toISOString().split("T")[0]} />
      </div>

      {/* Professional letterhead (screen + print) */}
      <ReportLetterhead title="Laporan Laba Rugi" subtitle="Multi-Step" periodLabel={periodLabel} />

      {/* KPI Cards (screen only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <DollarSign size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Pendapatan</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(totalRevenue)}</p>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-success/10">
            <BarChart3 size={20} className="text-success" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Laba Kotor</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(grossProfit)}</p>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-info/10">
            <TrendingUp size={20} className="text-info" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Laba Bersih</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(netProfit)}</p>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-warning/10">
            <Percent size={20} className="text-warning" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Margin</p>
            <p className="text-sm font-semibold text-foreground">{margin.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Income Statement Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
        <div className="p-4 px-5">
          <div className="overflow-x-auto">
            <DetailTable data-report-table="Laba Rugi">
              <DetailTableHead>
                <DetailTableTh>Kode</DetailTableTh>
                <DetailTableTh>Nama Akun</DetailTableTh>
                <DetailTableTh align="right">Jumlah (Rp)</DetailTableTh>
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
                    <DetailTableTd align="right">{formatAccounting(acc.balance)}</DetailTableTd>
                  </DetailTableRow>
                ))}
                <DetailTableRow>
                  <DetailTableTd colSpan={2} className="font-semibold">Total Pendapatan</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccounting(totalRevenue)}</DetailTableTd>
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
                        <DetailTableTd align="right">{formatAccounting(acc.balance)}</DetailTableTd>
                      </DetailTableRow>
                    ))}
                    <DetailTableRow>
                      <DetailTableTd colSpan={2} className="font-semibold">Total HPP</DetailTableTd>
                      <DetailTableTd align="right" className="font-semibold">{formatAccounting(totalCogs)}</DetailTableTd>
                    </DetailTableRow>
                  </>
                )}

                {/* Gross Profit */}
                <DetailTableRow className="border-t-2 border-default">
                  <DetailTableTd colSpan={2} className="font-bold text-primary">LABA KOTOR</DetailTableTd>
                  <DetailTableTd align="right" className="font-bold text-primary">{formatAccounting(grossProfit)}</DetailTableTd>
                </DetailTableRow>

                {/* Operating Expenses */}
                <DetailTableRow>
                  <DetailTableTd colSpan={3} className="font-bold bg-muted/30">BEBAN OPERASIONAL</DetailTableTd>
                </DetailTableRow>
                {expenseData.map((acc) => (
                  <DetailTableRow key={acc.id}>
                    <DetailTableTd>{acc.code}</DetailTableTd>
                    <DetailTableTd>{acc.name}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(acc.balance)}</DetailTableTd>
                  </DetailTableRow>
                ))}
                <DetailTableRow>
                  <DetailTableTd colSpan={2} className="font-semibold">Total Beban Operasional</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccounting(totalExpense)}</DetailTableTd>
                </DetailTableRow>

                {/* Operating Profit */}
                <DetailTableRow className="border-t-2 border-default">
                  <DetailTableTd colSpan={2} className="font-bold text-primary">LABA OPERASIONAL</DetailTableTd>
                  <DetailTableTd align="right" className="font-bold text-primary">{formatAccounting(operatingProfit)}</DetailTableTd>
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
                        <DetailTableTd align="right">{formatAccounting(acc.balance)}</DetailTableTd>
                      </DetailTableRow>
                    ))}
                    {otherExpenseData.map((acc) => (
                      <DetailTableRow key={acc.id}>
                        <DetailTableTd>{acc.code}</DetailTableTd>
                        <DetailTableTd>{acc.name}</DetailTableTd>
                        <DetailTableTd align="right">{formatAccounting(-acc.balance)}</DetailTableTd>
                      </DetailTableRow>
                    ))}
                    <DetailTableRow>
                      <DetailTableTd colSpan={2} className="font-semibold">Total Lain-lain</DetailTableTd>
                      <DetailTableTd align="right" className="font-semibold">{formatAccounting(totalOther)}</DetailTableTd>
                    </DetailTableRow>
                  </>
                )}

                {/* Net Profit */}
                <DetailTableRow className="border-t-2 border-default">
                  <DetailTableTd colSpan={2} className="font-bold text-lg text-primary">LABA BERSIH SEBELUM PAJAK</DetailTableTd>
                  <DetailTableTd align="right" className="font-bold text-lg text-primary">{formatAccounting(netProfit)}</DetailTableTd>
                </DetailTableRow>
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      </div>
    </div>
  )
}
