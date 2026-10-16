export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadFinancialRatios } from "@/lib/reports/financial-ratios-data"
import { buildRatiosTable } from "@/lib/reports/ratios-table"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Rasio Keuangan" }

export default async function FinancialRatiosPage({
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

  const { ratios, periodLabel, periodCaption } = await loadFinancialRatios(period)
  const table = buildRatiosTable(ratios)

  return (
    <ReportPageShell
      title="Rasio Keuangan"
      sheetTitle="Rasio Keuangan"
      subtitle="Likuiditas, Solvabilitas & Profitabilitas"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/rasio-keuangan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Rasio Keuangan"
          pdfHref={buildReportPdfHref("rasio-keuangan", period.slug)}
        />
      }
    >
      <ReportTableView columns={table.columns} rows={table.rows} tableLabel="Rasio Keuangan" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        Posisi aset/kewajiban/ekuitas dibaca sampai akhir periode, laba rugi sepanjang periode.
        Rasio bertanda “n/a” berarti penyebutnya nol, bukan hasil yang baik.
      </p>
    </ReportPageShell>
  )
}
