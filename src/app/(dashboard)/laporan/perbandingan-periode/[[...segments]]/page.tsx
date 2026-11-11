export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import Link from 'next/link'
import { sumEntriesByAccount } from '@/lib/services/report-aggregation.service'
import { requirePermission } from '@/lib/auth/permissions'
import { formatAccountingExact, formatDate } from "@/lib/utils/format"
import { toLocalDateOnly } from '@/lib/utils/date-only'
import { reportPeriodFromRoute, splitReportSegments } from "@/lib/reports/report-period"
import { buildReportHref } from '@/lib/reports/report-href'
import { buildBalanceComparison, buildComparison, groupBalancesByType, previousWindow, toAccountBalances } from '@/lib/reports/period-comparison'
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from '@/components/ui/detail-table'
import { EmptyState } from '@/components/ui/empty-state'
import { ExportButtons } from '@/components/reports/export-buttons'
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportLetterhead } from '@/components/reports/report-letterhead'
import { ReportSection, ReportKpiCard } from '@/components/reports/report-section'
import { ReportNarration } from '@/components/reports/report-narration'

import type { Metadata } from 'next'
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Perbandingan Periode" }

/**
 * Laba Rugi / Neraca dibandingkan dengan periode pembanding.
 *  - Laba Rugi : periode berjalan vs periode sama-panjang sebelumnya.
 *  - Neraca    : posisi per akhir periode vs posisi awal periode (kumulatif).
 */
export default async function PeriodComparisonPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ laporan?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  // Mode laporan (neraca / laba-rugi) ikut di path; param lama tetap dibaca
  // supaya tautan sebelum perpindahan membuka laporan yang sama.
  const mode = splitReportSegments(segments).filters.laporan ?? search.laporan
  const isBalance = mode === 'neraca'

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period

  const previous = previousWindow(startDate, endDate)

  // Neraca butuh kelima tipe: laba berjalan (Pendapatan − Beban) masuk ekuitas,
  // kalau tidak `Aset = Kewajiban + Ekuitas` tidak pernah tertutup.
  const types = isBalance
    ? ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
    : ['REVENUE', 'EXPENSE']

  const [accounts, currentSums, previousSums] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true, type: { in: types as ("ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE")[] } },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: 'asc' },
    }),
    isBalance
      ? sumEntriesByAccount({ date: { lte: endDate } })
      : sumEntriesByAccount({ date: { gte: startDate, lte: endDate } }),
    isBalance
      ? sumEntriesByAccount({ date: { lte: new Date(startDate.getTime() - 1) } })
      : sumEntriesByAccount({ date: { gte: previous.start, lte: previous.end } }),
  ])

  const currentBalances = toAccountBalances(accounts, currentSums)
  const previousBalances = toAccountBalances(accounts, previousSums)
  const comparison = buildComparison(currentBalances, previousBalances)
  const balance = isBalance
    ? buildBalanceComparison(groupBalancesByType(currentBalances), groupBalancesByType(previousBalances))
    : null

  const title = isBalance ? "Neraca Perbandingan Periode" : "Laba Rugi Perbandingan Periode"
  const currentLabel = isBalance
    ? `Per ${formatDate(endDate)}`
    : `Periode ${formatDate(startDate)} – ${formatDate(endDate)}`
  const previousLabel = isBalance
    ? `Per ${formatDate(new Date(startDate.getTime() - 1))}`
    : `Periode ${formatDate(previous.start)} – ${formatDate(previous.end)}`

  return (
    <ReportPageShell
      title="Perbandingan Periode"
      sheet={false}
      wide
      actions={<ExportButtons title={isBalance ? "Neraca_Perbandingan" : "Laba_Rugi_Perbandingan"} />}
      filter={
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {[
              { value: 'laba-rugi', label: 'Laba Rugi' },
              { value: 'neraca', label: 'Neraca' },
            ].map((tab) => {
              const active = (isBalance ? 'neraca' : 'laba-rugi') === tab.value
              const href = buildReportHref("/laporan/perbandingan-periode", period.slug, { laporan: tab.value })
              return (
                <Link
                  key={tab.value}
                  href={href}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-default text-muted-foreground hover:bg-muted'}`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>
          <ReportPeriodFilter
            basePath="/laporan/perbandingan-periode"
            mode="range"
            filters={{ laporan: isBalance ? "neraca" : undefined }}
            defaultStartDate={toLocalDateOnly(startDate)}
            defaultEndDate={toLocalDateOnly(endDate)}
          />
        </div>
      }
    >
      <ReportLetterhead title={title} subtitle="Periode Ini vs Pembanding" periodLabel={`${currentLabel} vs ${previousLabel}`} />
      <ReportNarration text={`Laporan ini membandingkan ${isBalance ? "posisi neraca" : "kinerja laba rugi"} periode berjalan dengan pembandingnya. Kolom Selisih menunjukkan perubahan nominal dan kolom % menunjukkan perubahan relatif; sel kosong berarti pembandingnya nol sehingga persentase tidak bermakna.`} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        {balance ? (
          <>
            <ReportKpiCard label="Total Aset" value={formatAccountingExact(balance.assets.totalCurrent)} />
            <ReportKpiCard label="Total Kewajiban" value={formatAccountingExact(balance.liabilities.totalCurrent)} />
            <ReportKpiCard label="Total Ekuitas" value={formatAccountingExact(balance.equity.totalCurrent)} />
            <ReportKpiCard
              label="Neraca Seimbang"
              value={balance.isBalanced ? "Ya" : "Tidak"}
              valueClassName={balance.isBalanced ? 'text-success' : 'text-danger'}
            />
          </>
        ) : (
          <>
            <ReportKpiCard label="Total Periode Ini" value={formatAccountingExact(comparison.totalCurrent)} />
            <ReportKpiCard label="Total Pembanding" value={formatAccountingExact(comparison.totalPrevious)} />
            <ReportKpiCard
              label="Selisih"
              value={formatAccountingExact(comparison.totalVariance)}
              valueClassName={comparison.totalVariance >= 0 ? 'text-success' : 'text-danger'}
            />
          </>
        )}
      </div>

      {balance ? (
        // Neraca: tiga blok, masing-masing dengan totalnya sendiri. Mengecilkan
        // ketiganya menjadi satu "TOTAL" adalah penjumlahan aset + kewajiban +
        // ekuitas — angka yang tidak punya arti (putaran 103).
        <>
          {[balance.assets, balance.liabilities, balance.equity].map((side) => (
            <ReportSection
              key={side.label}
              title={side.label}
              description={`${currentLabel} · pembanding ${previousLabel}`}
            >
              <DetailTable data-report-table={`${title} — ${side.label}`}>
                <DetailTableHead>
                  <DetailTableTh>Kode</DetailTableTh>
                  <DetailTableTh>Nama Akun</DetailTableTh>
                  <DetailTableTh align="right">Periode Ini</DetailTableTh>
                  <DetailTableTh align="right">Pembanding</DetailTableTh>
                  <DetailTableTh align="right">Selisih</DetailTableTh>
                  <DetailTableTh align="right">%</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {side.rows.map((row) => (
                    <DetailTableRow key={`${side.label}-${row.key}`}>
                      <DetailTableTd className="font-mono text-xs">{row.code}</DetailTableTd>
                      <DetailTableTd>{row.name}</DetailTableTd>
                      <DetailTableTd align="right">{formatAccountingExact(row.current, { zeroDash: false })}</DetailTableTd>
                      <DetailTableTd align="right">{formatAccountingExact(row.previous, { zeroDash: false })}</DetailTableTd>
                      <DetailTableTd align="right" className={row.variance >= 0 ? 'text-success' : 'text-danger'}>
                        {formatAccountingExact(row.variance, { zeroDash: false })}
                      </DetailTableTd>
                      <DetailTableTd align="right">{row.percentage === null ? '–' : `${row.percentage.toFixed(1)}%`}</DetailTableTd>
                    </DetailTableRow>
                  ))}
                  {side.rows.length === 0 && (
                    <DetailTableRow>
                      <DetailTableTd colSpan={6} className="text-center text-muted-foreground py-6">
                        <EmptyState title="Tidak ada saldo pada kedua periode" className="py-0" />
                      </DetailTableTd>
                    </DetailTableRow>
                  )}
                  <DetailTableRow className="border-t-2 border-default font-bold">
                    <DetailTableTd colSpan={2}>TOTAL {side.label.toUpperCase()}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccountingExact(side.totalCurrent, { zeroDash: false })}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccountingExact(side.totalPrevious, { zeroDash: false })}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccountingExact(side.totalVariance, { zeroDash: false })}</DetailTableTd>
                    <DetailTableTd align="right">{""}</DetailTableTd>
                  </DetailTableRow>
                </DetailTableBody>
              </DetailTable>
            </ReportSection>
          ))}
        </>
      ) : (
        <ReportSection title={title} description={`${currentLabel} · pembanding ${previousLabel}`}>
        <DetailTable data-report-table={title}>
          <DetailTableHead>
            <DetailTableTh>Kode</DetailTableTh>
            <DetailTableTh>Nama Akun</DetailTableTh>
            <DetailTableTh align="right">Periode Ini</DetailTableTh>
            <DetailTableTh align="right">Pembanding</DetailTableTh>
            <DetailTableTh align="right">Selisih</DetailTableTh>
            <DetailTableTh align="right">%</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {comparison.rows.map((row) => (
              <DetailTableRow key={row.key}>
                <DetailTableTd className="font-mono text-xs">{row.code}</DetailTableTd>
                <DetailTableTd>{row.name}</DetailTableTd>
                <DetailTableTd align="right">{formatAccountingExact(row.current, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{formatAccountingExact(row.previous, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right" className={row.variance >= 0 ? 'text-success' : 'text-danger'}>
                  {formatAccountingExact(row.variance, { zeroDash: false })}
                </DetailTableTd>
                <DetailTableTd align="right">{row.percentage === null ? '–' : `${row.percentage.toFixed(1)}%`}</DetailTableTd>
              </DetailTableRow>
            ))}
            {comparison.rows.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={6} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada mutasi pada kedua periode" className="py-0" /></DetailTableTd>
              </DetailTableRow>
            )}
            {comparison.rows.length > 0 && (
              <DetailTableRow className="border-t-2 border-default font-bold">
                <DetailTableTd colSpan={2}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccountingExact(comparison.totalCurrent, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{formatAccountingExact(comparison.totalPrevious, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{formatAccountingExact(comparison.totalVariance, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{""}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
      )}
    </ReportPageShell>
  )
}
