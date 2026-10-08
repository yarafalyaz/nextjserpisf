export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Buku Bank" }

export default async function BankBookPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  const startDate = params.tanggalMulai ? new Date(params.tanggalMulai) : new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = params.tanggalSelesai ? new Date(params.tanggalSelesai) : now
  endDate.setHours(23, 59, 59, 999)
  const accountId = params.accountId ? parseInt(params.accountId) : null

  const bankAccounts = await prisma.account.findMany({
    where: {
      isActive: true,
      type: 'ASSET',
      OR: [
        { code: { startsWith: '1-1' } },
        { name: { contains: 'Bank' } },
        { name: { contains: 'Kas' } },
      ],
    },
    orderBy: { code: 'asc' },
  })

  const selectedAccount = accountId ? bankAccounts.find(a => a.id === accountId) : null

  let openingBalance = 0
  let entries: { date: Date; journalNumber: string; description: string; debit: number; credit: number }[] = []

  if (accountId) {
    const openingEntries = await prisma.journalEntry.findMany({
      where: {
        accountId,
        journal: { status: { in: ['POSTED', 'REVERSED'] }, deletedAt: null, transactionDate: { lt: startDate } },
      },
    })
    openingBalance = openingEntries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0)

    const periodEntries = await prisma.journalEntry.findMany({
      where: {
        accountId,
        journal: { status: { in: ['POSTED', 'REVERSED'] }, deletedAt: null, transactionDate: { gte: startDate, lte: endDate } },
      },
      include: {
        journal: { select: { journalNumber: true, transactionDate: true, description: true } },
      },
      orderBy: [
        { journal: { transactionDate: 'asc' } },
        { id: 'asc' },
      ],
    })

    entries = periodEntries.map(e => ({
      date: e.journal.transactionDate,
      journalNumber: e.journal.journalNumber,
      description: e.memo || e.journal.description || '-',
      debit: Number(e.debit),
      credit: Number(e.credit),
    }))
  }

  const rows = entries.reduce<Array<{ date: Date; journalNumber: string; description: string; debit: number; credit: number; balance: number }>>((acc, entry) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].balance : openingBalance
    const next = prev + entry.debit - entry.credit
    acc.push({ ...entry, balance: next })
    return acc
  }, [])

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
  // No in-period movement → closing = opening balance (not 0).
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance

  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Buku Bank" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Buku Bank" />
      </div>

      <form className="mb-2 flex items-center gap-4 flex-wrap print:hidden">
        <div className="flex flex-col gap-1.5 w-[250px]">
          <Label htmlFor="accountId">Akun Kas/Bank</Label>
          <FormSelect
            id="accountId"
            name="accountId"
            defaultValue={params.accountId || undefined}
            placeholder="-- Pilih Akun --"
            options={bankAccounts.map(acc => ({ value: String(acc.id), label: `${acc.code} - ${acc.name}` }))}
          />
        </div>
        <AppDatePicker label="Dari" name="tanggalMulai" defaultValue={params.tanggalMulai || toLocalDateOnly(startDate)} className="w-[180px]" />
        <AppDatePicker label="Sampai" name="tanggalSelesai" defaultValue={params.tanggalSelesai || toLocalDateOnly(endDate)} className="w-[180px]" />
        <Button type="submit" variant="primary" size="sm">Tampilkan</Button>
      </form>

      {!accountId && (
        <div className="flex flex-col items-center gap-3 py-16 text-center print:hidden">
          <p className="text-muted-foreground text-sm">Pilih akun kas/bank untuk melihat buku bank</p>
        </div>
      )}

      {accountId && selectedAccount && (
        <>
          <ReportLetterhead title="Buku Bank" subtitle={`${selectedAccount.code} – ${selectedAccount.name}`} periodLabel={periodLabel} />
      <ReportNarration text="Laporan Buku Bank menyajikan mutasi kas di rekening bank selama periode tertentu. Laporan ini mencatat setiap setoran, penarikan, dan biaya bank yang memengaruhi saldo kas perusahaan, sehingga membantu dalam rekonsiliasi bank dan pengelolaan likuiditas." />

          <ReportSection title="Transaksi">
            <DetailTable data-report-table="Buku Bank">
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
                {rows.map((row, i) => (
                  <DetailTableRow key={i}>
                    <DetailTableTd>{row.date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</DetailTableTd>
                    <DetailTableTd>{row.journalNumber}</DetailTableTd>
                    <DetailTableTd>{row.description}</DetailTableTd>
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
