export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { hasAnyPermission, requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { SptAmendmentSopDialog } from "@/components/reports/spt-amendment-sop-dialog"
import { SptReplaceExportButton } from "@/components/reports/spt-replace-export-button"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { vatInvoiceSummary } from "@/lib/reports/vat-invoices"
import { loadVatInvoices } from "@/lib/reports/vat-invoices-data"
import { buildSptReplaceCsv, getReplaceSchemaEligibility } from "@/lib/reports/spt-replace-export"
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
  const canExportCoretax = await hasAnyPermission(["create_tax_invoices", "view_spt_filings"])
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))

  const { report, raw, periodLabel, periodCaption } = await loadVatInvoices(period)
  const eligibility = getReplaceSchemaEligibility(period.start)
  const replaceExport = buildSptReplaceCsv({
    periodSlug: period.slug,
    report,
    raw,
  })

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
        <div className="flex flex-wrap items-center gap-2">
          <SptAmendmentSopDialog />
          {canExportCoretax && (
            <SptReplaceExportButton
              csv={replaceExport.csv}
              filename={replaceExport.filename}
              eligible={eligibility.eligible}
              eligibilityReason={eligibility.reason}
              rowCount={replaceExport.rowCount}
              outputDpp={replaceExport.totals.outputDpp}
              outputNetVat={replaceExport.totals.outputNetVat}
              inputDpp={replaceExport.totals.inputDpp}
              inputVat={replaceExport.totals.inputVat}
              netVat={replaceExport.totals.netVat}
            />
          )}
          <ExportButtons
            title="Faktur SPT Masa PPN"
            pdfHref={buildReportPdfHref("faktur-ppn", period.slug)}
          />
        </div>
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
