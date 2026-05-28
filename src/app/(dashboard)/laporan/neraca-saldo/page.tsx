export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { Scale } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd, DetailTableFoot, DetailTableFootRow } from "@/components/ui/detail-table"
import { ReportSingleDateFilter } from "@/components/reports/report-date-filter"

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
  { label: "Reports", href: "/laporan" },
  { label: "Trial Balance" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Scale size={24} />
          <h1>Neraca Saldo (Trial Balance)</h1>
        <ExportButtons title="Trial_Balance" />
        </div>
        <p>Per tanggal: {asOfDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <ReportSingleDateFilter defaultDate={params.date || asOfDate.toISOString().split('T')[0]} />

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Daftar Neraca Saldo</h2>
        </div>
        <div className="p-4 px-5">
          <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>Kode Akun</DetailTableTh>
                  <DetailTableTh>Nama Akun</DetailTableTh>
                  <DetailTableTh>Tipe</DetailTableTh>
                  <DetailTableTh align="right">Total Debit</DetailTableTh>
                  <DetailTableTh align="right">Total Kredit</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {data.map((acc) => (
                    <DetailTableRow key={acc.id}>
                      <DetailTableTd>{acc.code}</DetailTableTd>
                      <DetailTableTd>{acc.name}</DetailTableTd>
                      <DetailTableTd>{acc.type}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(acc.totalDebit)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(acc.totalCredit)}</DetailTableTd>
                    </DetailTableRow>
                  ))}
                  {data.length === 0 && (
                    <DetailTableRow>
                      <DetailTableTd colSpan={5} className="text-center">Tidak ada data jurnal yang sudah diposting</DetailTableTd>
                    </DetailTableRow>
                  )}
                </DetailTableBody>
                {data.length > 0 && (
                  <DetailTableFoot>
                    <DetailTableFootRow className="font-bold">
                      <DetailTableTd colSpan={3}>TOTAL</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(grandTotalDebit)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(grandTotalCredit)}</DetailTableTd>
                    </DetailTableFootRow>
                  </DetailTableFoot>
                )}
              </DetailTable>
            </div>
          </div>
        </div>
      </div>

      {/* Balance Check */}
      <div className={`bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md mt-6 ${isBalanced ? "border-success" : "border-danger"}`}>
        <div className={`text-xl font-bold ${isBalanced ? "text-success" : "text-danger"}`}>
          {isBalanced ? 'SEIMBANG' : 'TIDAK SEIMBANG'}
        </div>
        <div className="text-[0.8125rem] text-muted font-medium">
          Total Debit: {formatCurrency(grandTotalDebit)} | Total Kredit: {formatCurrency(grandTotalCredit)}
        </div>
      </div>
    </div>
  )
}
