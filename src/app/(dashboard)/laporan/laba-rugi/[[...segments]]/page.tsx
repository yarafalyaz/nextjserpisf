export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/auth/permissions'
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { StatementTableView } from "@/components/reports/statement-table-view"
import { statementOptionsToParams } from "@/lib/reports/statement-display"
import { loadStatementOptionsContext } from "@/lib/reports/statement-options-context"
import { loadIncomeStatementStatement } from "@/lib/reports/statement-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { serializeStatementCsv } from "@/lib/reports/statement-csv"
import { StatementOptions } from "@/components/reports/statement-options"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laba Rugi" }

export default async function IncomeStatementPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission('view_reports')
  const { period, options, showPercent } = await loadStatementOptionsContext(routeParams, searchParams)

  // Baris tabel disusun sekali di sini dan dipakai bersama layar + engine PDF.
  const statement = await loadIncomeStatementStatement(period, options, showPercent)

  return (
    <ReportPageShell
      title="Laba Rugi"
      sheetTitle="Laba/Rugi (Standar)"
      subtitle="Multi Tahap"
      periodLabel={statement.periodLabel}
      periodCaption={statement.periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <StatementOptions
          basePath="/laporan/laba-rugi"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          currentOptions={options}
          currentPercent={showPercent}
          showPercentColumn
        />
      }
      actions={
        <ExportButtons
          title="Laba Rugi"
          pdfHref={buildReportPdfHref("laba-rugi", period.slug, {
            ...statementOptionsToParams(options),
            ...(showPercent ? { kolomPersen: "1" } : {}),
          })}
          csvData={serializeStatementCsv("Laba Rugi", statement.table)}
        />
      }
    >
      <StatementTableView table={statement.table} tableLabel="Laba Rugi" />
    </ReportPageShell>
  )
}
