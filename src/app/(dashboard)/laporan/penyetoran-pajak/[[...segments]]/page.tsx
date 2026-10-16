export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadTaxPayments } from "@/lib/reports/tax-payments-data"
import { taxPaymentSummary } from "@/lib/finance/tax-payment"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Penyetoran Pajak" }

export default async function TaxPaymentsReportPage({
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

  const { result, periodLabel, periodCaption } = await loadTaxPayments(period)

  return (
    <ReportPageShell
      title="Penyetoran Pajak"
      sheetTitle="Penyetoran Pajak"
      subtitle="Setoran ke Kas Negara pada Periode Terpilih"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/penyetoran-pajak"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons title="Penyetoran Pajak" pdfHref={buildReportPdfHref("penyetoran-pajak", period.slug)} />
      }
    >
      <ReportTableView columns={result.table.columns} rows={result.table.rows} tableLabel="Penyetoran Pajak" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {taxPaymentSummary(result)}
      </p>
    </ReportPageShell>
  )
}
