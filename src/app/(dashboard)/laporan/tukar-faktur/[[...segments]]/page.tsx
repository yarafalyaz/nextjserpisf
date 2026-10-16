export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadInvoiceExchanges } from "@/lib/reports/invoice-exchanges-data"
import { invoiceExchangeSummary } from "@/lib/finance/invoice-exchange"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Rincian Tukar Faktur" }

export default async function InvoiceExchangesReportPage({
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

  const { result, periodLabel, periodCaption } = await loadInvoiceExchanges(period)

  return (
    <ReportPageShell
      title="Rincian Tukar Faktur"
      sheetTitle="Rincian Tukar Faktur"
      subtitle="Penyerahan Faktur & Pelunasan Piutang"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/tukar-faktur"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons title="Rincian Tukar Faktur" pdfHref={buildReportPdfHref("tukar-faktur", period.slug)} />
      }
    >
      <ReportTableView columns={result.table.columns} rows={result.table.rows} tableLabel="Rincian Tukar Faktur" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {invoiceExchangeSummary(result)}
      </p>
    </ReportPageShell>
  )
}
