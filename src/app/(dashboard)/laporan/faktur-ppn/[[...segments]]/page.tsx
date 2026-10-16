export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { vatInvoiceSummary } from "@/lib/reports/vat-invoices"
import { loadVatInvoices } from "@/lib/reports/vat-invoices-data"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"

export const metadata: Metadata = { title: "Faktur SPT Masa PPN" }

export default async function VatInvoicePage({
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

  const { report, periodLabel, periodCaption } = await loadVatInvoices(period)

  return (
    <ReportPageShell
      title="Faktur SPT Masa PPN"
      sheetTitle="Faktur SPT Masa PPN"
      subtitle="PPN Keluaran & Masukan per Faktur"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/faktur-ppn"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Faktur SPT Masa PPN"
          pdfHref={buildReportPdfHref("faktur-ppn", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Faktur SPT Masa PPN"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {vatInvoiceSummary(report)}
      </p>
    </ReportPageShell>
  )
}
