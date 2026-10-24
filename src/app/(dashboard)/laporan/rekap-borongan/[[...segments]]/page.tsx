export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { reportPeriodFromRoute, formatPeriodLabel } from "@/lib/reports/report-period"
import { loadLaborRecapReport } from "@/lib/reports/labor-recap-export"
import { LaborRecapCard } from "@/components/reports/labor-recap-card"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Rekap Borongan" }

/**
 * F-2026-10-20-97a (tahap frontend): rekap upah borongan per teknisi.
 *
 * Data dari loader read-only `getLaborRecap` (builder `buildLaborRecap`,
 * PR #271): rekap INFORMATIF atas baris ProductionCost labor existing —
 * bukan dasar bayar, bukan dasar jurnal, tanpa tombol bayar. Periode rute
 * path-only disaring menurut Timesheet.date (F-038); baris tanpa tanggal
 * kerja terbukti tampil di kelompok terpisah di luar total periode.
 */
export default async function LaborRecapPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const { report } = await loadLaborRecapReport({ start: period.start, end: period.end })
  const periodLabel = formatPeriodLabel(period)

  return (
    <ReportPageShell
      title="Rekap Borongan"
      sheetTitle="Rekap Borongan"
      subtitle="Upah Borongan per Teknisi (Informatif)"
      periodLabel={periodLabel}
      periodCaption={`${periodLabel} · disaring menurut tanggal kerja timesheet`}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/rekap-borongan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Rekap Borongan"
          pdfHref={buildReportPdfHref("rekap-borongan", period.slug)}
        />
      }
    >
      <LaborRecapCard recap={report} />
    </ReportPageShell>
  )
}
