export const dynamic = "force-dynamic"

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
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laba Rugi Terealisasi" }

/** Jurnal yang sudah diposting (POSTED + pembalik REVERSED). */
export const REALISED_STATUSES = REPORT_JOURNAL_STATUSES

export default async function RealisedIncomeStatementPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
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

  const statement = await loadIncomeStatementByStatus(period, options, showPercent, REALISED_STATUSES)

  return (
    <ReportPageShell
      title="Laba Rugi Terealisasi"
      sheetTitle="Laba/Rugi (Terealisasi)"
      subtitle="Jurnal Sudah Diposting"
      periodLabel={statement.periodLabel}
      periodCaption={statement.periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <StatementOptions
          basePath="/laporan/laba-rugi-terealisasi"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          currentOptions={options}
          currentPercent={showPercent}
          showPercentColumn
        />
      }
      actions={
        <ExportButtons
          title="Laba Rugi Terealisasi"
          pdfHref={buildReportPdfHref("laba-rugi-terealisasi", period.slug, {
            ...statementOptionsToParams(options),
            ...(showPercent ? { kolomPersen: "1" } : {}),
          })}
          csvData={serializeStatementCsv("Laba Rugi Terealisasi", statement.table)}
        />
      }
    >
      <StatementTableView table={statement.table} tableLabel="Laba Rugi Terealisasi" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        Laporan ini memuat laba/rugi dari jurnal yang sudah diposting (POSTED dan pembalik REVERSED),
        yaitu yang benar-benar terbukukan di buku besar.
      </p>
    </ReportPageShell>
  )
}
