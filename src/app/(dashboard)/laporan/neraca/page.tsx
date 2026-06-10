export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { BarChart3 } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportSingleDateFilter } from "@/components/reports/report-date-filter"
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

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Laporan", href: "/laporan" },
  { label: "Neraca" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={24} />
          <h1>Neraca</h1>
        <ExportButtons title="Balance_Sheet" />
        </div>
        <p>Per tanggal: {asOfDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <ReportSingleDateFilter defaultDate={params.date || asOfDate.toISOString().split('T')[0]} />

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
        <div className="text-[0.8125rem] text-muted-foreground font-medium">
          Aset: {formatCurrency(totalAssets)} | Kewajiban + Ekuitas: {formatCurrency(totalLiabilities + totalEquity)}
        </div>
      </div>
    </div>
  )
}
