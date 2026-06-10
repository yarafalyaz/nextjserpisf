export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { BookOpen } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/page-header"
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

  // Fetch all active accounts for dropdown
  const allAccounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  })

  // Fetch journal entries for selected account
  let entries: { id: number; date: Date; journalNumber: string; memo: string | null; description: string | null; debit: number; credit: number }[] = []
  let selectedAccount: { code: string; name: string } | null = null
  let openingBalance = 0

  if (accountId) {
    const account = allAccounts.find((a) => a.id === accountId)
    if (account) {
      selectedAccount = { code: account.code, name: account.name }
    }

    // Opening balance: sum of all entries before startDate
    const openingEntries = await prisma.journalEntry.findMany({
      where: {
        accountId,
        journal: { status: { in: ['POSTED', 'REVERSED'] }, transactionDate: { lt: startDate } },
      },
      select: { debit: true, credit: true },
    })
    openingBalance = openingEntries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0)

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
      // Deterministic ordering: date first, then entry id as a stable tiebreaker.
      // Without the id tiebreaker, same-day entries render in arbitrary order and
      // the running-balance column shows inconsistent intermediate values across
      // refreshes (the final balance is unaffected, but the per-row saldo isn't).
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
        <div className="bg-surface rounded-xl border border-default shadow-sm p-8 text-center print:hidden">
          <BookOpen size={48} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">Pilih akun untuk melihat buku besar</p>
        </div>
      )}

      {accountId && selectedAccount && (
        <>
          {/* Professional letterhead (screen + print) */}
          <ReportLetterhead title="Buku Besar" subtitle={ledgerSubtitle} periodLabel={periodLabel} />

          <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
            <div className="p-4 px-5">
              <div className="overflow-x-auto">
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
              </div>

              {/* Summary (screen only) */}
              {rows.length > 0 && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
                  <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Debit</p>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(totalDebit)}</p>
                    </div>
                  </div>
                  <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Kredit</p>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(totalCredit)}</p>
                    </div>
                  </div>
                  <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo Akhir</p>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(finalBalance)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
