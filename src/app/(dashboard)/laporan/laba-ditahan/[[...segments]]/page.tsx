export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadEquityChanges } from "@/lib/reports/equity-changes-data"
import { buildRetainedEarnings, buildRetainedEarningsTable } from "@/lib/reports/equity-changes"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Laba Ditahan" }

export default async function RetainedEarningsPage({
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

  const data = await loadEquityChanges(period)
  const result = buildRetainedEarnings(data.accounts, data.netProfit)
  const table = buildRetainedEarningsTable(result)

  return (
    <ReportPageShell
      title="Laba Ditahan"
      sheetTitle="Laba Ditahan"
      subtitle="Saldo Awal, Laba Periode & Saldo Akhir"
      periodLabel={data.periodLabel}
      periodCaption={data.periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/laba-ditahan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Laba Ditahan"
          pdfHref={buildReportPdfHref("laba-ditahan", period.slug)}
        />
      }
    >
      <ReportTableView columns={table.columns} rows={table.rows} tableLabel="Laba Ditahan" />
    </ReportPageShell>
  )
}
