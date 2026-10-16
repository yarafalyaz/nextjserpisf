export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute, splitReportSegments } from "@/lib/reports/report-period"
import { loadPurchasesByDimension } from "@/lib/reports/purchase-by-dimension-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import {
  PURCHASE_DIMENSION_LABEL,
  PURCHASE_DIMENSIONS,
  purchaseByDimensionSummary,
  type PurchaseDimension,
} from "@/lib/reports/purchase-by-dimension"

export const metadata: Metadata = { title: "Pembelian per Kelompok" }

function parseDimension(raw: string | undefined): PurchaseDimension {
  return (PURCHASE_DIMENSIONS as readonly string[]).includes(raw ?? "")
    ? (raw as PurchaseDimension)
    : "pemasok"
}

export default async function PurchasesByDimensionPage({
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

  const [{ segments = [] }] = await Promise.all([routeParams])
  const { filters } = splitReportSegments(segments)
  const dimension = parseDimension(filters.dimensi)

  const { result, periodLabel, periodCaption } = await loadPurchasesByDimension(period, dimension)

  return (
    <ReportPageShell
      title="Pembelian per Kelompok"
      sheetTitle="Pembelian"
      subtitle={`Per ${PURCHASE_DIMENSION_LABEL[dimension]}`}
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/pembelian"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          selects={[
            {
              param: "dimensi",
              label: "Kelompok",
              placeholder: "Per Pemasok",
              value: dimension,
              options: PURCHASE_DIMENSIONS.map((value) => ({ value, label: PURCHASE_DIMENSION_LABEL[value] })),
            },
          ]}
        />
      }
      actions={
        <ExportButtons
          title="Pembelian per Kelompok"
          pdfHref={buildReportPdfHref("pembelian", period.slug, { dimensi: dimension })}
        />
      }
    >
      <ReportTableView
        columns={result.table.columns}
        rows={result.table.rows}
        tableLabel="Pembelian per Kelompok"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {purchaseByDimensionSummary(result)}
      </p>
    </ReportPageShell>
  )
}
