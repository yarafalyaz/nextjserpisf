export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatAccounting, formatCurrency } from '@/lib/utils/format'
import { buildPeriodColumns, MULTI_PERIOD_MODE_LABELS, parseMultiPeriodCount, type MultiPeriodMode } from '@/lib/reports/multi-period'
import { reportPeriodFromRoute, splitReportSegments } from '@/lib/reports/report-period'
import type { AccountType } from '@prisma/client'
import { ReportLetterhead } from '@/components/reports/report-letterhead'
import { ReportSection, ReportKpiCard } from '@/components/reports/report-section'
import { ReportNarration } from '@/components/reports/report-narration'
import { ExportButtons } from '@/components/reports/export-buttons'
import { EmptyState } from '@/components/ui/empty-state'
import { MultiPeriodFilter } from '@/components/reports/multi-period-filter'

import type { Metadata } from 'next'
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Laporan Multi Periode" }

type StatementType = 'laba-rugi' | 'neraca'

const CREDIT_NORMAL = new Set(['REVENUE', 'LIABILITY', 'EQUITY'])

export default async function MultiPeriodReportPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ jenis?: string; mode?: string; jumlah?: string; akhir?: string }>
}) {
  await requirePermission('view_reports')

  // Segmen pertama = tanggal jangkar periode; sisanya pasangan opsi laporan.
  // Param lama (?jenis=&mode=&jumlah=&akhir=) tetap dibaca.
  const anchorPeriod = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({ start: now, end: now }), {
    legacyParam: "akhir",
  })
  const anchor = anchorPeriod.start

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const filters = splitReportSegments(segments).filters
  const jenis = filters.jenis ?? search.jenis
  const modeParam = filters.mode ?? search.mode
  const statement: StatementType = jenis === 'neraca' ? 'neraca' : 'laba-rugi'
  const mode: MultiPeriodMode = modeParam === 'kuartal' ? 'kuartal' : modeParam === 'tahun' ? 'tahun' : 'bulan'
  const count = parseMultiPeriodCount(filters.jumlah ?? search.jumlah)

  const typeFilter: AccountType[] =
    statement === 'neraca' ? ['ASSET', 'LIABILITY', 'EQUITY'] : ['REVENUE', 'EXPENSE']
  const columns = buildPeriodColumns(mode, count, anchor)

  // One aggregate per column: movement inside the period for P&L, cumulative
  // balance up to the period end for the balance sheet.
  const perColumn = await Promise.all(
    columns.map((column) =>
      prisma.journalEntry.groupBy({
        by: ['accountId'],
        where: {
          journal: {
            status: { in: ['POSTED', 'REVERSED'] },
            transactionDate:
              statement === 'neraca' ? { lte: column.end } : { gte: column.start, lte: column.end },
          },
          account: { type: { in: typeFilter } },
        },
        _sum: { debit: true, credit: true },
      }),
    ),
  )

  const accountIds = [...new Set(perColumn.flat().map((row) => row.accountId))]
  const accounts = accountIds.length
    ? await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { code: 'asc' },
      })
    : []

  const cells = new Map<number, Map<string, number>>()
  perColumn.forEach((rows, index) => {
    const columnKey = columns[index].key
    for (const row of rows) {
      const debit = Number(row._sum?.debit ?? 0)
      const credit = Number(row._sum?.credit ?? 0)
      const normal = CREDIT_NORMAL.has(accounts.find((a) => a.id === row.accountId)?.type ?? '')
      const value = normal ? credit - debit : debit - credit
      if (value === 0) continue
      const bucket = cells.get(row.accountId) ?? new Map<string, number>()
      bucket.set(columnKey, value)
      cells.set(row.accountId, bucket)
    }
  })

  const rows = accounts.filter((account) => {
    const bucket = cells.get(account.id)
    return bucket && [...bucket.values()].some((value) => Math.abs(value) >= 0.005)
  })

  const sumByType = (type: string) =>
    columns.map((column) =>
      rows
        .filter((account) => account.type === type)
        .reduce((total, account) => total + (cells.get(account.id)?.get(column.key) ?? 0), 0),
    )

  const netProfit = columns.map((_, index) => {
    const revenue = sumByType('REVENUE')[index]
    const expense = sumByType('EXPENSE')[index]
    return revenue - expense
  })

  const totalColumnValue = (accountId: number) => {
    const bucket = cells.get(accountId)
    if (!bucket) return 0
    if (statement === 'neraca') return bucket.get(columns[columns.length - 1].key) ?? 0
    return [...bucket.values()].reduce((total, value) => total + value, 0)
  }

  const totalAssets = sumByType('ASSET')
  const totalLiabilitiesEquity = columns.map((_, index) => sumByType('LIABILITY')[index] + sumByType('EQUITY')[index])

  const columnCount = columns.length + 2 // label + total
  const periodLabel = `${MULTI_PERIOD_MODE_LABELS[mode]} — ${columns[0].label} s/d ${columns[columns.length - 1].label}`

  const section = (title: string, type: string, values: number[] | null) => (
    <>
      <tr className="bg-surface-muted/60">
        <td colSpan={columnCount} className="px-3 py-2 text-sm font-semibold text-foreground">{title}</td>
      </tr>
      {rows
        .filter((account) => account.type === type)
        .map((account) => (
          <tr key={account.id} className="border-b border-default/60">
            <td className="px-3 py-1.5 text-sm whitespace-nowrap">{account.code} — {account.name}</td>
            {columns.map((column) => (
              <td key={column.key} className="px-3 py-1.5 text-right text-sm tabular-nums">
                {formatAccounting(cells.get(account.id)?.get(column.key) ?? 0, { zeroDash: true })}
              </td>
            ))}
            <td className="px-3 py-1.5 text-right text-sm font-semibold tabular-nums">
              {formatAccounting(totalColumnValue(account.id), { zeroDash: true })}
            </td>
          </tr>
        ))}
      {values && (
        <tr className="border-b border-default bg-surface-muted/40 font-semibold">
          <td className="px-3 py-2 text-sm">Total {title}</td>
          {columns.map((column, index) => (
            <td key={column.key} className="px-3 py-2 text-right text-sm tabular-nums">
              {formatAccounting(values[index], { zeroDash: false })}
            </td>
          ))}
          <td className="px-3 py-2 text-right text-sm tabular-nums">
            {formatAccounting(
              statement === 'neraca' ? values[values.length - 1] : values.reduce((a, b) => a + b, 0),
              { zeroDash: false },
            )}
          </td>
        </tr>
      )}
    </>
  )

  return (
    <ReportPageShell title="Laporan Multi Periode" sheet={false} wide filter={<>
<div className="print:hidden">
        <MultiPeriodFilter
          basePath="/laporan/multi-periode"
          periodSlug={anchorPeriod.slug}
          statement={statement}
          mode={mode}
          count={count}
        />
      </div>
</>} actions={<>
<div className="flex items-center justify-end print:hidden">
        <ExportButtons title={statement === 'neraca' ? 'Neraca_Multi_Periode' : 'Laba_Rugi_Multi_Periode'} />
      </div>
</>}>






      <ReportLetterhead
        title={statement === 'neraca' ? "Neraca Multi Periode" : "Laba Rugi Multi Periode"}
        subtitle={statement === 'neraca' ? "Neraca Multi Periode" : "Laba Rugi Multi Periode"}
        periodLabel={periodLabel}
      />
      <ReportNarration
        text={
          statement === 'neraca'
            ? `Neraca multi periode menampilkan saldo kumulatif setiap akun hingga akhir masing-masing periode. Kolom terakhir adalah kondisi terkini (${columns[columns.length - 1].label}). Neraca harus seimbang: Total Aset = Total Liabilitas + Ekuitas.`
            : `Laba rugi multi periode menampilkan arus pendapatan dan beban per periode (bukan kumulatif), sehingga tren tiap ${MULTI_PERIOD_MODE_LABELS[mode].toLowerCase().replace('an', '')} terlihat berdampingan.`
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        {statement === 'neraca' ? (
          <>
            <ReportKpiCard label={`Total Aset (${columns[columns.length - 1].label})`} value={formatCurrency(totalAssets[totalAssets.length - 1])} />
            <ReportKpiCard label="Total Liabilitas + Ekuitas" value={formatCurrency(totalLiabilitiesEquity[totalLiabilitiesEquity.length - 1])} />
            <ReportKpiCard
              label="Selisih (harus 0)"
              value={formatCurrency(totalAssets[totalAssets.length - 1] - totalLiabilitiesEquity[totalLiabilitiesEquity.length - 1])}
              valueClassName={Math.abs(totalAssets[totalAssets.length - 1] - totalLiabilitiesEquity[totalLiabilitiesEquity.length - 1]) < 0.005 ? 'text-success' : 'text-danger'}
            />
          </>
        ) : (
          <>
            <ReportKpiCard label={`Laba Bersih (${columns[columns.length - 1].label})`} value={formatCurrency(netProfit[netProfit.length - 1])} />
            <ReportKpiCard label="Total Laba Bersih Periode" value={formatCurrency(netProfit.reduce((a, b) => a + b, 0))} />
            <ReportKpiCard label="Jumlah Periode" value={`${columns.length} ${MULTI_PERIOD_MODE_LABELS[mode]}`} />
          </>
        )}
      </div>

      <ReportSection title={statement === 'neraca' ? "Neraca per Periode" : "Laba Rugi per Periode"}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse" data-report-table={statement === 'neraca' ? 'Neraca Multi Periode' : 'Laba Rugi Multi Periode'}>
            <thead>
              <tr className="border-b-2 border-default bg-surface-muted">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Akun</th>
                {columns.map((column) => (
                  <th key={column.key} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {column.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                  {statement === 'neraca' ? 'Saldo Akhir' : 'Total'}
                </th>
              </tr>
            </thead>
            <tbody>
              {statement === 'neraca' ? (
                <>
                  {section('Aset', 'ASSET', totalAssets)}
                  {section('Liabilitas', 'LIABILITY', sumByType('LIABILITY'))}
                  {section('Ekuitas', 'EQUITY', sumByType('EQUITY'))}
                  <tr className="border-t-2 border-default bg-surface-muted/40 font-bold">
                    <td className="px-3 py-2 text-sm">Total Liabilitas + Ekuitas</td>
                    {columns.map((column, index) => (
                      <td key={column.key} className="px-3 py-2 text-right text-sm tabular-nums">
                        {formatAccounting(totalLiabilitiesEquity[index], { zeroDash: false })}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {formatAccounting(totalLiabilitiesEquity[totalLiabilitiesEquity.length - 1], { zeroDash: false })}
                    </td>
                  </tr>
                </>
              ) : (
                <>
                  {section('Pendapatan', 'REVENUE', sumByType('REVENUE'))}
                  {section('Beban', 'EXPENSE', sumByType('EXPENSE'))}
                  <tr className="border-t-2 border-default bg-surface-muted/40 font-bold">
                    <td className="px-3 py-2 text-sm">Laba Bersih</td>
                    {columns.map((column, index) => (
                      <td key={column.key} className="px-3 py-2 text-right text-sm tabular-nums">
                        {formatAccounting(netProfit[index], { zeroDash: false })}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {formatAccounting(netProfit.reduce((a, b) => a + b, 0), { zeroDash: false })}
                    </td>
                  </tr>
                </>
              )}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    <EmptyState title="Tidak ada mutasi akun pada periode ini" className="py-0" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ReportSection>
    </ReportPageShell>
  )
}
