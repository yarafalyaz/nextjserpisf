export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadPurchaseAdvances } from "@/lib/reports/purchase-advances-data"
import { advanceListingSummary } from "@/lib/finance/purchase-advance"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Uang Muka Pembelian" }

export default async function PurchaseAdvancesReportPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))

  const { result, periodLabel, periodCaption } = await loadPurchaseAdvances(period)

  return (
    <ReportPageShell
      title="Uang Muka Pembelian"
      sheetTitle="Uang Muka Pembelian"
      subtitle="Dibayarkan pada Periode Terpilih"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/uang-muka-pembelian"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Uang Muka Pembelian"
          pdfHref={buildReportPdfHref("uang-muka-pembelian", period.slug)}
        />
      }
    >
      <ReportTableView columns={result.table.columns} rows={result.table.rows} tableLabel="Uang Muka Pembelian" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {advanceListingSummary(result)}
      </p>
    </ReportPageShell>
  )
}
