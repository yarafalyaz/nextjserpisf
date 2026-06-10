export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatAccounting } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportSingleDateFilter } from "@/components/reports/report-date-filter"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { computeBalanceSheet } from "@/lib/finance/balance-sheet"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Neraca" }

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
        status: { in: ['POSTED', 'REVERSED'] },
        transactionDate: { lte: asOfDate },
      },
    },
    include: { account: true },
  })

  // Aggregation + net-income roll-up lives in computeBalanceSheet (unit-tested).
  const { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, isBalanced } =
    computeBalanceSheet(
      entries.map((e) => ({
        accountId: e.accountId,
        accountName: e.account.name,
        accountCode: e.account.code,
        accountType: e.account.type,
        debit: Number(e.debit),
        credit: Number(e.credit),
      }))
    )

  const asOfLabel = asOfDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Neraca" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Neraca" />
      </div>

      <div className="print:hidden">
        <ReportSingleDateFilter defaultDate={params.date || asOfDate.toISOString().split('T')[0]} />
      </div>

      {/* Professional letterhead (screen + print) */}
      <ReportLetterhead title="Neraca" subtitle="Laporan Posisi Keuangan" periodLabel={`Per ${asOfLabel}`} />

      {/* ASET */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6 no-break">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">ASET</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable data-report-table="Aset">
            <DetailTableHead>
              <DetailTableTh>Kode</DetailTableTh>
              <DetailTableTh>Nama Akun</DetailTableTh>
              <DetailTableTh align="right">Saldo (Rp)</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {assets.map((a) => (
                <DetailTableRow key={a.code}>
                  <DetailTableTd>{a.code}</DetailTableTd>
                  <DetailTableTd>{a.name}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(a.balance)}</DetailTableTd>
                </DetailTableRow>
              ))}
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={2}>Total Aset</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalAssets)}</DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* KEWAJIBAN */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6 no-break">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">KEWAJIBAN</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable data-report-table="Kewajiban">
            <DetailTableHead>
              <DetailTableTh>Kode</DetailTableTh>
              <DetailTableTh>Nama Akun</DetailTableTh>
              <DetailTableTh align="right">Saldo (Rp)</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {liabilities.map((a) => (
                <DetailTableRow key={a.code}>
                  <DetailTableTd>{a.code}</DetailTableTd>
                  <DetailTableTd>{a.name}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(a.balance)}</DetailTableTd>
                </DetailTableRow>
              ))}
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={2}>Total Kewajiban</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalLiabilities)}</DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* EKUITAS */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6 no-break">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">EKUITAS</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable data-report-table="Ekuitas">
            <DetailTableHead>
              <DetailTableTh>Kode</DetailTableTh>
              <DetailTableTh>Nama Akun</DetailTableTh>
              <DetailTableTh align="right">Saldo (Rp)</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {equity.map((a) => (
                <DetailTableRow key={a.code}>
                  <DetailTableTd>{a.code}</DetailTableTd>
                  <DetailTableTd>{a.name}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(a.balance)}</DetailTableTd>
                </DetailTableRow>
              ))}
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={2}>Total Ekuitas</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalEquity)}</DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Balance Check */}
      <div className={`bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border no-break ${isBalanced ? "border-success" : "border-danger"}`}>
        <div className={`text-xl font-bold ${isBalanced ? "text-success" : "text-danger"}`}>
          {isBalanced ? 'SEIMBANG' : 'TIDAK SEIMBANG'}
        </div>
        <div className="text-[0.8125rem] text-muted-foreground font-medium">
          Aset: {formatAccounting(totalAssets, { showSymbol: true })} | Kewajiban + Ekuitas: {formatAccounting(totalLiabilities + totalEquity, { showSymbol: true })}
        </div>
      </div>
    </div>
  )
}
