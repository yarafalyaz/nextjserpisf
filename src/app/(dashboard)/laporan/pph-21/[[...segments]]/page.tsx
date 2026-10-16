export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadPayrollRows } from "@/lib/reports/payroll-reports-data"
import { buildPph21, pph21Summary } from "@/lib/reports/payroll-reports"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "PPh 21 Karyawan" }

export default async function PayrollPph21Page({
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

  const data = await loadPayrollRows(period)
  const result = buildPph21({ rows: data.rows, draftSlips: data.draftSlips })

  return (
    <ReportPageShell
      title="PPh 21 Karyawan"
      sheetTitle="PPh 21 Karyawan"
      subtitle="Pemotongan PPh 21 dari Slip Gaji"
      periodLabel={data.periodLabel}
      periodCaption={data.periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/pph-21"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={<ExportButtons title="PPh 21 Karyawan" pdfHref={buildReportPdfHref("pph-21", period.slug)} />}
    >
      <ReportTableView columns={result.table.columns} rows={result.table.rows} tableLabel="PPh 21 Karyawan" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {pph21Summary(result)}
      </p>
    </ReportPageShell>
  )
}
