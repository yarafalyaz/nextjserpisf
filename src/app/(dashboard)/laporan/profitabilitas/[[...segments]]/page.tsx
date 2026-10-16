export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute, splitReportSegments } from "@/lib/reports/report-period"
import { loadProfitability } from "@/lib/reports/profitability-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import {
  DIMENSION_LABEL,
  PROFITABILITY_DIMENSIONS,
  profitabilitySummary,
  type ProfitabilityDimension,
} from "@/lib/reports/profitability"

export const metadata: Metadata = { title: "Profitabilitas & HPP" }

function parseDimension(raw: string | undefined): ProfitabilityDimension {
  return (PROFITABILITY_DIMENSIONS as readonly string[]).includes(raw ?? "")
    ? (raw as ProfitabilityDimension)
    : "faktur"
}

export default async function ProfitabilityPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const [{ segments = [] }] = await Promise.all([routeParams])
  const { filters } = splitReportSegments(segments)
  const dimension = parseDimension(filters.dimensi)

  const { result, periodLabel, periodCaption } = await loadProfitability(period, dimension)

  return (
    <ReportPageShell
      title="Profitabilitas & HPP"
      sheetTitle="Profitabilitas & HPP"
      subtitle={`Per ${DIMENSION_LABEL[dimension]}`}
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/profitabilitas"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          selects={[
            {
              param: "dimensi",
              label: "Kelompok",
              placeholder: "Per Faktur",
              value: dimension,
              options: PROFITABILITY_DIMENSIONS.map((value) => ({ value, label: DIMENSION_LABEL[value] })),
            },
          ]}
        />
      }
      actions={
        <ExportButtons
          title="Profitabilitas & HPP"
          pdfHref={buildReportPdfHref("profitabilitas", period.slug, { dimensi: dimension })}
        />
      }
    >
      <ReportTableView
        columns={result.table.columns}
        rows={result.table.rows}
        tableLabel="Profitabilitas & HPP"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {profitabilitySummary(result)}
      </p>
    </ReportPageShell>
  )
}
