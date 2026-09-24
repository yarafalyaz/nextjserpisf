export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { sumNetForAccount } from "@/lib/services/report-aggregation.service"
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { BookOpen } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Buku Besar" }

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  const startDate = params.tanggalMulai
    ? new Date(params.tanggalMulai)
    : new Date(now.getFullYear(), 0, 1)
  const endDate = params.tanggalSelesai ? new Date(params.tanggalSelesai) : now
  endDate.setHours(23, 59, 59, 999)
  const accountId = params.accountId ? parseInt(params.accountId) : null

  const allAccounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  })

  let entries: { id: number; date: Date; journalNumber: string; memo: string | null; description: string | null; debit: number; credit: number }[] = []
  let selectedAccount: { code: string; name: string } | null = null
  let openingBalance = 0

  if (accountId) {
    const account = allAccounts.find((a) => a.id === accountId)
    if (account) {
      selectedAccount = { code: account.code, name: account.name }
    }

    // Opening balance is a single SUM over prior postings - loading every earlier
    // journal line into Node just to add them up does not scale.
    openingBalance = await sumNetForAccount(accountId, { date: { lt: startDate } })

    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        accountId,
        journal: {
          status: { in: ['POSTED', 'REVERSED'] },
          transactionDate: { gte: startDate, lte: endDate },
        },
      },
      include: {
        journal: {
          select: { journalNumber: true, transactionDate: true, description: true },
        },
      },
      orderBy: [
        { journal: { transactionDate: 'asc' } },
        { id: 'asc' },
      ],
    })

    entries = journalEntries.map((e) => ({
      id: e.id,
      date: e.journal.transactionDate,
      journalNumber: e.journal.journalNumber,
      memo: e.memo,
      description: e.journal.description,
      debit: Number(e.debit),
      credit: Number(e.credit),
    }))
  }

  const rows = entries.reduce<Array<(typeof entries)[number] & { balance: number }>>((acc, entry) => {
    const previousBalance = acc.length > 0 ? acc[acc.length - 1].balance : openingBalance
    const nextBalance = previousBalance + entry.debit - entry.credit
    acc.push({ ...entry, balance: nextBalance })
    return acc
  }, [])

  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0)
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0)
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].balance : 0

  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
  const ledgerSubtitle = selectedAccount ? `${selectedAccount.code} – ${selectedAccount.name}` : undefined

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Buku Besar" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Buku Besar" />
      </div>

      <form className="mb-2 flex items-center gap-4 flex-wrap print:hidden">
        <div className="flex flex-col gap-1.5 w-[250px]">
          <Label htmlFor="accountId">Akun</Label>
          <FormSelect
            id="accountId"
            name="accountId"
            defaultValue={params.accountId || undefined}
            placeholder="-- Pilih Akun --"
            options={allAccounts.map((acc) => ({ value: String(acc.id), label: `${acc.code} - ${acc.name}` }))}
          />
        </div>
        <AppDatePicker label="Dari" name="tanggalMulai" defaultValue={params.tanggalMulai || startDate.toISOString().split('T')[0]} className="w-[180px]" />
        <AppDatePicker label="Sampai" name="tanggalSelesai" defaultValue={params.tanggalSelesai || endDate.toISOString().split('T')[0]} className="w-[180px]" />
        <Button type="submit" variant="primary" size="sm">Tampilkan</Button>
      </form>

      {!accountId && (
        <div className="flex flex-col items-center gap-3 py-16 text-center print:hidden">
          <BookOpen size={48} className="text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Pilih akun untuk melihat buku besar</p>
        </div>
      )}

      {accountId && selectedAccount && (
        <>
          <ReportLetterhead title="Buku Besar" subtitle={ledgerSubtitle} periodLabel={periodLabel} />
      <ReportNarration text="Laporan Buku Besar menyajikan mutasi setiap akun secara kronologis selama satu periode. Setiap baris menampilkan tanggal transaksi, keterangan, referensi jurnal, serta jumlah debit dan kredit yang memengaruhi saldo akun. Laporan ini bermanfaat untuk menelusuri riwayat transaksi dan memverifikasi posting ke masing-masing akun secara detail." />

          <ReportSection title="Transaksi">
            <DetailTable data-report-table="Buku Besar">
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>No. Jurnal</DetailTableTh>
                <DetailTableTh>Keterangan</DetailTableTh>
                <DetailTableTh align="right">Debit (Rp)</DetailTableTh>
                <DetailTableTh align="right">Kredit (Rp)</DetailTableTh>
                <DetailTableTh align="right">Saldo (Rp)</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                <DetailTableRow className="bg-muted/30">
                  <DetailTableTd colSpan={5} className="font-semibold">Saldo Awal</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccounting(openingBalance)}</DetailTableTd>
                </DetailTableRow>
                {rows.length === 0 && (
                  <DetailTableRow>
                    <DetailTableTd colSpan={6} className="text-center text-muted-foreground">Tidak ada transaksi dalam periode ini</DetailTableTd>
                  </DetailTableRow>
                )}
                {rows.map((row) => (
                  <DetailTableRow key={row.id}>
                    <DetailTableTd>{row.date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</DetailTableTd>
                    <DetailTableTd>{row.journalNumber}</DetailTableTd>
                    <DetailTableTd>{row.memo || row.description || '-'}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(row.debit)}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(row.credit)}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(row.balance)}</DetailTableTd>
                  </DetailTableRow>
                ))}
                {rows.length > 0 && (
                  <DetailTableRow className="font-bold border-t-2 border-default">
                    <DetailTableTd colSpan={3}>TOTAL & Saldo Akhir</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(totalDebit)}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(totalCredit)}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(finalBalance)}</DetailTableTd>
                  </DetailTableRow>
                )}
              </DetailTableBody>
            </DetailTable>
          </ReportSection>

          {/* Summary (screen only) */}
          {rows.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 print:hidden">
              <ReportKpiCard label="Total Debit" value={formatCurrency(totalDebit)} />
              <ReportKpiCard label="Total Kredit" value={formatCurrency(totalCredit)} />
              <ReportKpiCard label="Saldo Akhir" value={formatCurrency(finalBalance)} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
