export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { Landmark } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { PrintHeader } from "@/components/reports/print-header"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/page-header"
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

  // Get bank/cash accounts (code starts with 1-1)
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

  // Get opening balance (all entries before startDate)
  let openingBalance = 0
  let entries: { date: Date; journalNumber: string; description: string; debit: number; credit: number }[] = []

  if (accountId) {
    const openingEntries = await prisma.journalEntry.findMany({
      where: {
        accountId,
        journal: { status: { in: ['POSTED', 'REVERSED'] }, transactionDate: { lt: startDate } },
      },
    })
    openingBalance = openingEntries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0)

    const periodEntries = await prisma.journalEntry.findMany({
      where: {
        accountId,
        journal: { status: { in: ['POSTED', 'REVERSED'] }, transactionDate: { gte: startDate, lte: endDate } },
      },
      include: {
        journal: { select: { journalNumber: true, transactionDate: true, description: true } },
      },
      // Deterministic ordering: date first, then entry id as a stable tiebreaker
      // so same-day rows keep a consistent running-balance (saldo) order across
      // refreshes. Mirrors the general ledger (buku-besar).
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

  const rows = entries.reduce<Array<(typeof entries)[number] & { balance: number }>>((acc, entry) => {
    const previousBalance = acc.length > 0 ? acc[acc.length - 1].balance : openingBalance
    const nextBalance = previousBalance + entry.debit - entry.credit
    acc.push({ ...entry, balance: nextBalance })
    return acc
  }, [])

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance
  const period = `${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')}`

  return (
    <div className="flex flex-col gap-6">
      <PrintHeader title="Buku Bank" period={period} />
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Laporan", href: "/laporan" },
        { label: "Buku Bank" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Landmark size={24} />
          <h1>Buku Bank / Kas</h1>
        </div>
        <ExportButtons title="Bank_Book" />
      </div>

      <form className="mb-6 flex items-center gap-4 flex-wrap print:hidden">
        <div className="flex flex-col gap-1.5 w-[280px]">
          <Label htmlFor="accountId">Rekening</Label>
          <FormSelect
            id="accountId"
            name="accountId"
            defaultValue={params.accountId || undefined}
            placeholder="-- Pilih Rekening --"
            options={bankAccounts.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />
        </div>
        <AppDatePicker label="Dari" name="tanggalMulai" defaultValue={params.tanggalMulai || startDate.toISOString().split('T')[0]} className="w-[180px]" />
        <AppDatePicker label="Sampai" name="tanggalSelesai" defaultValue={params.tanggalSelesai || endDate.toISOString().split('T')[0]} className="w-[180px]" />
        <Button type="submit" variant="primary" size="sm">Tampilkan</Button>
      </form>

      {!accountId && (
        <div className="bg-surface rounded-xl p-8 border border-default text-center text-muted-foreground">
          Pilih rekening bank/kas untuk melihat mutasi
        </div>
      )}

      {accountId && selectedAccount && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6">
            <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="text-[0.8125rem] text-muted-foreground font-medium">Saldo Awal</div>
              <div className="text-lg font-bold">{formatCurrency(openingBalance)}</div>
            </div>
            <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="text-[0.8125rem] text-muted-foreground font-medium">Total Masuk</div>
              <div className="text-lg font-bold text-success">{formatCurrency(totalDebit)}</div>
            </div>
            <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="text-[0.8125rem] text-muted-foreground font-medium">Total Keluar</div>
              <div className="text-lg font-bold text-danger">{formatCurrency(totalCredit)}</div>
            </div>
            <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="text-[0.8125rem] text-muted-foreground font-medium">Saldo Akhir</div>
              <div className={`text-lg font-bold ${closingBalance >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(closingBalance)}</div>
            </div>
          </div>

          {/* Mutasi Table */}
          <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 px-5 border-b border-default">
              <h2 className="text-[0.9375rem] font-semibold text-foreground">Mutasi {selectedAccount.code} - {selectedAccount.name}</h2>
              <span className="text-sm text-muted-foreground">{rows.length} transaksi</span>
            </div>
            <div className="p-4 px-5">
              <DetailTable data-report-table="Bank Book">
                <DetailTableHead>
                  <DetailTableTh>Tanggal</DetailTableTh>
                  <DetailTableTh>No. Jurnal</DetailTableTh>
                  <DetailTableTh>Keterangan</DetailTableTh>
                  <DetailTableTh align="right">Masuk (Debit)</DetailTableTh>
                  <DetailTableTh align="right">Keluar (Kredit)</DetailTableTh>
                  <DetailTableTh align="right">Saldo</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {/* Opening balance row */}
                  <DetailTableRow className="bg-default/30">
                    <DetailTableTd>{startDate.toLocaleDateString('id-ID')}</DetailTableTd>
                    <DetailTableTd>-</DetailTableTd>
                    <DetailTableTd className="font-medium">Saldo Awal</DetailTableTd>
                    <DetailTableTd align="right">-</DetailTableTd>
                    <DetailTableTd align="right">-</DetailTableTd>
                    <DetailTableTd align="right" className="font-medium">{formatCurrency(openingBalance)}</DetailTableTd>
                  </DetailTableRow>
                  {rows.map((row, i) => (
                    <DetailTableRow key={i}>
                      <DetailTableTd>{row.date.toLocaleDateString('id-ID')}</DetailTableTd>
                      <DetailTableTd className="font-mono text-sm">{row.journalNumber}</DetailTableTd>
                      <DetailTableTd>{row.description}</DetailTableTd>
                      <DetailTableTd align="right" className="text-success">{row.debit > 0 ? formatCurrency(row.debit) : '-'}</DetailTableTd>
                      <DetailTableTd align="right" className="text-danger">{row.credit > 0 ? formatCurrency(row.credit) : '-'}</DetailTableTd>
                      <DetailTableTd align="right" className="font-medium">{formatCurrency(row.balance)}</DetailTableTd>
                    </DetailTableRow>
                  ))}
                  {rows.length === 0 && (
                    <DetailTableRow><DetailTableTd colSpan={6} className="text-center text-muted-foreground py-6">Tidak ada mutasi dalam periode ini</DetailTableTd></DetailTableRow>
                  )}
                  <DetailTableRow className="font-bold border-t-2 border-default">
                    <DetailTableTd colSpan={3}>TOTAL / SALDO AKHIR</DetailTableTd>
                    <DetailTableTd align="right" className="text-success">{formatCurrency(totalDebit)}</DetailTableTd>
                    <DetailTableTd align="right" className="text-danger">{formatCurrency(totalCredit)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(closingBalance)}</DetailTableTd>
                  </DetailTableRow>
                </DetailTableBody>
              </DetailTable>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
