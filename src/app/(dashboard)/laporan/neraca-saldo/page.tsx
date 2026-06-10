export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatAccounting } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd, DetailTableFoot, DetailTableFootRow } from "@/components/ui/detail-table"
import { ReportSingleDateFilter } from "@/components/reports/report-date-filter"
import { ReportLetterhead } from "@/components/reports/report-letterhead"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Neraca Saldo" }

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
            status: { in: ['POSTED', 'REVERSED'] },
            transactionDate: { lte: asOfDate },
          },
        },
      },
    },
    orderBy: { code: 'asc' },
  })

  const data = accounts
    .map((acc) => {
      const totalDebit = acc.journalEntries.reduce((sum, e) => sum + Number(e.debit), 0)
      const totalCredit = acc.journalEntries.reduce((sum, e) => sum + Number(e.credit), 0)
      const netBalance = totalDebit - totalCredit
      // Proper trial balance: net debit balance for debit-normal accounts (ASSET, EXPENSE),
      // net credit balance for credit-normal accounts (LIABILITY, EQUITY, REVENUE).
      const isDebitNormal = acc.type === 'ASSET' || acc.type === 'EXPENSE'
      const debitBalance = isDebitNormal ? Math.max(0, netBalance) : Math.max(0, -netBalance)
      const creditBalance = isDebitNormal ? Math.max(0, -netBalance) : Math.max(0, netBalance)
      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        totalDebit: debitBalance,
        totalCredit: creditBalance,
      }
    })
    .filter((a) => a.totalDebit > 0 || a.totalCredit > 0)

  const grandTotalDebit = data.reduce((sum, a) => sum + a.totalDebit, 0)
  const grandTotalCredit = data.reduce((sum, a) => sum + a.totalCredit, 0)
  const isBalanced = Math.abs(grandTotalDebit - grandTotalCredit) < 0.01

  const asOfLabel = asOfDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Neraca Saldo" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Neraca Saldo" />
      </div>

      <div className="print:hidden">
        <ReportSingleDateFilter defaultDate={params.date || asOfDate.toISOString().split('T')[0]} />
      </div>

      {/* Professional letterhead (screen + print) */}
      <ReportLetterhead title="Neraca Saldo" subtitle="Trial Balance" periodLabel={`Per ${asOfLabel}`} />

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-4 px-5">
          <div className="overflow-x-auto">
            <DetailTable data-report-table="Neraca Saldo">
              <DetailTableHead>
                <DetailTableTh>Kode Akun</DetailTableTh>
                <DetailTableTh>Nama Akun</DetailTableTh>
                <DetailTableTh>Tipe</DetailTableTh>
                <DetailTableTh align="right">Debit (Rp)</DetailTableTh>
                <DetailTableTh align="right">Kredit (Rp)</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {data.map((acc) => (
                  <DetailTableRow key={acc.id}>
                    <DetailTableTd>{acc.code}</DetailTableTd>
                    <DetailTableTd>{acc.name}</DetailTableTd>
                    <DetailTableTd>{acc.type}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(acc.totalDebit)}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(acc.totalCredit)}</DetailTableTd>
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
                  <DetailTableFootRow className="font-bold border-t-2 border-default">
                    <DetailTableTd colSpan={3}>TOTAL</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(grandTotalDebit)}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(grandTotalCredit)}</DetailTableTd>
                  </DetailTableFootRow>
                </DetailTableFoot>
              )}
            </DetailTable>
          </div>
        </div>
      </div>

      {/* Balance Check */}
      <div className={`bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border no-break ${isBalanced ? "border-success" : "border-danger"}`}>
        <div className={`text-xl font-bold ${isBalanced ? "text-success" : "text-danger"}`}>
          {isBalanced ? 'SEIMBANG' : 'TIDAK SEIMBANG'}
        </div>
        <div className="text-[0.8125rem] text-muted-foreground font-medium">
          Total Debit: {formatAccounting(grandTotalDebit, { showSymbol: true })} | Total Kredit: {formatAccounting(grandTotalCredit, { showSymbol: true })}
        </div>
      </div>
    </div>
  )
}
