export const dynamic = "force-dynamic"

import { cookies } from "next/headers"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportTableView } from "@/components/reports/report-table-view"
import { StatementOptions } from "@/components/reports/statement-options"
import {
  allStatementOptionParamNames,
  decodeStatementOptions,
  parseStatementOptions,
  statementOptionsToParams,
  STATEMENT_OPTIONS_COOKIE,
} from "@/lib/reports/statement-display"
import { parseReportPeriod } from "@/lib/reports/report-period"
import { loadSkontroBalanceSheet } from "@/lib/reports/skontro-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Neraca Skontro" }

export default async function SkontroBalanceSheetPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")
  const [params, search] = await Promise.all([routeParams, searchParams])

  const now = new Date()
  // Posisi "per" tanggal: slug 2026-10 berarti per 31 Okt 2026.
  const period = parseReportPeriod(params.segments?.[0] ?? search.date, { start: now, end: now })
  const asOfDate = new Date(period.end)

  const cookieStore = await cookies()
  const fromCookie = decodeStatementOptions(cookieStore.get(STATEMENT_OPTIONS_COOKIE)?.value)
  const hasQueryOptions = allStatementOptionParamNames().some((name) => search[name] !== undefined)
  const options = hasQueryOptions ? parseStatementOptions(search) : fromCookie.options

  const statement = await loadSkontroBalanceSheet(asOfDate, options)

  return (
    <ReportPageShell
      title="Neraca Skontro"
      sheetTitle="Neraca (Induk Skontro)"
      subtitle="Laporan Posisi Keuangan — Dua Sisi"
      periodLabel={statement.periodLabel}
      periodCaption={statement.periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <StatementOptions
          basePath="/laporan/neraca-skontro"
          singleDate
          defaultStartDate={toLocalDateOnly(asOfDate)}
          defaultEndDate={toLocalDateOnly(asOfDate)}
          currentOptions={options}
        />
      }
      actions={
        <ExportButtons
          title="Neraca Skontro"
          pdfHref={buildReportPdfHref("neraca-skontro", period.slug, statementOptionsToParams(options))}
        />
      }
    >
      <ReportTableView
        columns={statement.table.columns}
        rows={statement.table.rows}
        tableLabel="Neraca Skontro"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        Bentuk skontro menyandingkan Aktiva (kiri) dengan Pasiva — kewajiban dan ekuitas — (kanan).
        Baris yang tidak punya pasangan dibiarkan kosong; kedua sisi tetap harus sama pada baris
        Jumlah.
      </p>
    </ReportPageShell>
  )
}
