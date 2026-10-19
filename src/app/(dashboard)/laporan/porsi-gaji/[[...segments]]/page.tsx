export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requireAnyPermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadPayrollRows } from "@/lib/reports/payroll-reports-data"
import { buildPayrollComposition, payrollCompositionSummary } from "@/lib/reports/payroll-reports"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Porsi Gaji" }

export default async function PayrollCompositionPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireAnyPermission(["view_payroll_reports", "view_reports"])

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))

  const data = await loadPayrollRows(period)
  const result = buildPayrollComposition({ rows: data.rows, draftSlips: data.draftSlips })

  return (
    <ReportPageShell
      title="Porsi Gaji"
      sheetTitle="Porsi Gaji"
      subtitle="Komposisi Penerimaan, Potongan & Gaji Bersih"
      periodLabel={data.periodLabel}
      periodCaption={data.periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/porsi-gaji"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={<ExportButtons title="Porsi Gaji" pdfHref={buildReportPdfHref("porsi-gaji", period.slug)} />}
    >
      <ReportTableView columns={result.table.columns} rows={result.table.rows} tableLabel="Porsi Gaji" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {payrollCompositionSummary(result)}
      </p>
    </ReportPageShell>
  )
}
