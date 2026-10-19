export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { loadPayrollPageContext } from "@/lib/reports/payroll-page-context"
import { buildPayrollByEmployee, payrollByEmployeeSummary } from "@/lib/reports/payroll-reports"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Gaji Karyawan" }

export default async function PayrollByEmployeePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { user, period, data } = await loadPayrollPageContext(routeParams, searchParams)
  const result = buildPayrollByEmployee({
    rows: data.rows,
    draftSlips: data.draftSlips,
    duplicateEmployees: data.duplicateEmployees,
  })

  return (
    <ReportPageShell
      title="Gaji Karyawan"
      sheetTitle="Gaji Karyawan"
      subtitle="Per Karyawan pada Periode Terpilih"
      periodLabel={data.periodLabel}
      periodCaption={data.periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/gaji-karyawan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons title="Gaji Karyawan" pdfHref={buildReportPdfHref("gaji-karyawan", period.slug)} />
      }
    >
      <ReportTableView columns={result.table.columns} rows={result.table.rows} tableLabel="Gaji Karyawan" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {payrollByEmployeeSummary(result)}
      </p>
    </ReportPageShell>
  )
}
