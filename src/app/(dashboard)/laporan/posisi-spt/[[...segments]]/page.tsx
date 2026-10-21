export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { loadTaxSummarySpt } from "@/lib/reports/tax-summary-data"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"

export const metadata: Metadata = { title: "Posisi SPT Masa PPN" }

export default async function SptPositionPage({
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

  const { table, periodLabel, periodCaption } = await loadTaxSummarySpt(period)

  return (
    <ReportPageShell
      title="Posisi SPT Masa PPN"
      sheetTitle="Posisi SPT Masa PPN"
      subtitle="Per Masa: Dokumen vs Jurnal POSTED vs Setor"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/posisi-spt"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Posisi SPT Masa PPN"
          pdfHref={buildReportPdfHref("posisi-spt", period.slug)}
        />
      }
    >
      <ReportTableView columns={table.columns} rows={table.rows} tableLabel="Posisi SPT Masa PPN" />
    </ReportPageShell>
  )
}
