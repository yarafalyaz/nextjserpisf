import { cookies } from "next/headers"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { StatementTableView } from "@/components/reports/statement-table-view"
import { StatementOptions } from "@/components/reports/statement-options"
import {
  allStatementOptionParamNames,
  decodeStatementOptions,
  parseStatementOptions,
  statementOptionsToParams,
  STATEMENT_OPTIONS_COOKIE,
} from "@/lib/reports/statement-display"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadIncomeStatementByStatus } from "@/lib/reports/statement-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { serializeStatementCsv } from "@/lib/reports/statement-csv"

export interface IncomeStatementPageProps {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}

export interface IncomeStatementTexts {
  title: string
  sheetTitle: string
  subtitle: string
  basePath: string
  pdfSlug: "laba-rugi-terealisasi" | "laba-rugi-tidak-terealisasi"
  exportTitle: string
  footnote: string
}

export async function IncomeStatementPage({
  routeParams,
  searchParams,
  statuses,
  texts,
}: {
  routeParams: IncomeStatementPageProps["params"]
  searchParams: IncomeStatementPageProps["searchParams"]
  statuses: readonly string[]
  texts: IncomeStatementTexts
}) {
  const user = await requirePermission("view_reports")
  const search = await searchParams

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const cookieStore = await cookies()
  const fromCookie = decodeStatementOptions(cookieStore.get(STATEMENT_OPTIONS_COOKIE)?.value)
  const hasQueryOptions = allStatementOptionParamNames().some((name) => search[name] !== undefined)
  const options = hasQueryOptions ? parseStatementOptions(search) : fromCookie.options
  const showPercent =
    search.kolomPersen !== undefined ? search.kolomPersen === "1" : fromCookie.percentColumn

  const statement = await loadIncomeStatementByStatus(period, options, showPercent, statuses)

  return (
    <ReportPageShell
      title={texts.title}
      sheetTitle={texts.sheetTitle}
      subtitle={texts.subtitle}
      periodLabel={statement.periodLabel}
      periodCaption={statement.periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <StatementOptions
          basePath={texts.basePath}
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          currentOptions={options}
          currentPercent={showPercent}
          showPercentColumn
        />
      }
      actions={
        <ExportButtons
          title={texts.exportTitle}
          pdfHref={buildReportPdfHref(texts.pdfSlug, period.slug, {
            ...statementOptionsToParams(options),
            ...(showPercent ? { kolomPersen: "1" } : {}),
          })}
          csvData={serializeStatementCsv(texts.exportTitle, statement.table)}
        />
      }
    >
      <StatementTableView table={statement.table} tableLabel={texts.exportTitle} />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {texts.footnote}
      </p>
    </ReportPageShell>
  )
}
