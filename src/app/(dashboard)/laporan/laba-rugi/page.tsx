export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { sumEntriesByAccount } from "@/lib/services/report-aggregation.service"
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportDateFilter } from "@/components/reports/report-date-filter"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
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

  const [accounts, periodSums] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: 'asc' },
    }),
    // Totalled in SQL: the previous `include: { journalEntries }` loaded every
    // journal line of the period into Node just to add up debit/credit.
    sumEntriesByAccount({ date: { gte: startDate, lte: endDate } }),
  ])

  const {
    revenueData, cogsData, expenseData, otherIncomeData, otherExpenseData,
    totalRevenue, totalCogs, grossProfit, totalExpense, operatingProfit,
    totalOther, netProfit, margin,
  } = computeIncomeStatement(
    accounts.map((acc) => ({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      debit: periodSums.get(acc.id)?.debit ?? 0,
      credit: periodSums.get(acc.id)?.credit ?? 0,
    }))
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

      <ReportLetterhead title="Laporan Laba Rugi" subtitle="Multi-Step" periodLabel={periodLabel} />

      <ReportNarration
        text={`Laporan Laba Rugi menunjukkan kinerja keuangan perusahaan selama ${periodLabel.replace("Periode ", "")}. Laporan ini menggunakan metode multi-step yang menyajikan secara bertahap: Pendapatan Usaha, Harga Pokok Penjualan (HPP), Laba Kotor, Beban Operasional, Laba Operasional, Pendapatan/Beban Lain-lain, hingga Laba Bersih. Total pendapatan tercatat sebesar ${formatCurrency(totalRevenue)} dengan laba kotor ${formatCurrency(grossProfit)} dan laba bersih ${formatCurrency(netProfit)} atau margin sebesar ${margin.toFixed(1)}%.`}
      />

      {/* KPI Summary (print: inline) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 print:hidden">
        <ReportKpiCard label="Total Pendapatan" value={formatCurrency(totalRevenue)} />
        <ReportKpiCard label="Laba Kotor" value={formatCurrency(grossProfit)} />
        <ReportKpiCard label="Laba Bersih" value={formatCurrency(netProfit)} />
        <ReportKpiCard label="Margin" value={`${margin.toFixed(1)}%`} />
      </div>

      {/* Income Statement Table */}
      <ReportSection title="Laba Rugi">
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
      </ReportSection>
    </div>
  )
}
