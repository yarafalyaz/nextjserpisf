export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/auth/permissions'
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadProjectPlReport } from "@/lib/reports/project-pl-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ProjectPlCard } from "@/components/reports/project-pl-card"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laba Rugi Proyek" }

export default async function ProjectPnLPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period
  endDate.setHours(23, 59, 59, 999)

  // F-2026-10-21-029: satu-satunya sumber angka halaman ini adalah builder
  // `buildProjectPl` lewat loader `loadProjectPlReport` — halaman tidak lagi
  // mengagregasi invoice/material/beban sendiri (dulu tanpa ProductionCost
  // dan tanpa jembatan invoice lewat WO/quotation). Ekspor PDF memakai
  // loader yang sama lewat registry `laba-rugi-proyek` (bukan scraping DOM);
  // CSV tetap dari tabel layar yang dirender dari baris builder yang sama.
  const report = await loadProjectPlReport({ start: startDate, end: endDate })

  return (
    <ReportPageShell
      title="Laba Rugi per Proyek"
      sheetTitle="Laba Rugi per Proyek / Perintah Kerja"
      subtitle="Rincian Pendapatan, Biaya, dan Laba per Proyek"
      periodLabel={report.periodLabel}
      periodCaption={report.periodCaption}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/laba-rugi-proyek"
          mode="range"
          defaultStartDate={toLocalDateOnly(startDate)}
          defaultEndDate={toLocalDateOnly(endDate)}
        />
      }
      actions={
        <ExportButtons
          title="Laba_Rugi_per_Proyek"
          pdfHref={buildReportPdfHref("laba-rugi-proyek", period.slug)}
        />
      }
    >
      <ProjectPlCard rows={report.rows} />
    </ReportPageShell>
  )
}
