export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { requirePermission } from '@/lib/auth/permissions'
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { StatementTableView } from "@/components/reports/statement-table-view"
import {
  allStatementOptionParamNames,
  decodeStatementOptions,
  parseStatementOptions,
  statementOptionsToParams,
  STATEMENT_OPTIONS_COOKIE,
} from "@/lib/reports/statement-display"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
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
  const search = await searchParams

  // Periode dari path; tautan lama (?tanggalMulai=) tetap dihormati. Aturannya
  // hidup di satu tempat, `reportPeriodFromRoute`.
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const cookieStore = await cookies()
  const fromCookie = decodeStatementOptions(cookieStore.get(STATEMENT_OPTIONS_COOKIE)?.value)
  // An explicit query param (legacy share link) wins over the stored preference.
  const hasQueryOptions = allStatementOptionParamNames().some((name) => search[name] !== undefined)
  const options = hasQueryOptions ? parseStatementOptions(search) : fromCookie.options
  const showPercent = search.kolomPersen !== undefined ? search.kolomPersen === '1' : fromCookie.percentColumn

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
