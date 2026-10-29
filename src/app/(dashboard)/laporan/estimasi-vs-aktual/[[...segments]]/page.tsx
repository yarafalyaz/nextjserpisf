export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadJobEstimateVsActual } from "@/lib/reports/job-estimate-vs-actual-data"
import { jobEstimateVsActualSummary } from "@/lib/reports/job-estimate-vs-actual"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Estimasi vs Aktual Pekerjaan" }

/**
 * Estimasi vs aktual per pekerjaan — nilai penawaran yang disetujui melawan
 * penagihan aktual dan biaya aktual, dikelompokkan per pekerjaan/kendaraan.
 * Estimasi biaya dari snapshot WorkOrderCostEstimate (R3); kosong tampil
 * "–" + penanda jujur (bukan nol).
 */
export default async function JobEstimateVsActualPage({
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

  const { estimate, periodLabel, periodCaption } = await loadJobEstimateVsActual(period)

  return (
    <ReportPageShell
      title="Estimasi vs Aktual Pekerjaan"
      sheetTitle="Estimasi vs Aktual Pekerjaan"
      subtitle="Penawaran Disetujui vs Penagihan & Biaya Aktual per Pekerjaan"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/estimasi-vs-aktual"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Estimasi vs Aktual Pekerjaan"
          pdfHref={buildReportPdfHref("estimasi-vs-aktual", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={estimate.table.columns}
        rows={estimate.table.rows}
        tableLabel="Estimasi vs Aktual Pekerjaan"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {jobEstimateVsActualSummary(estimate)} · estimasi adalah nilai penawaran yang disetujui;
        penagihan hanya menghitung invoice terbit (posted/parsial/lunas); biaya aktual dari
        penyerapan biaya produksi pekerjaan dan perintah produksinya.
      </p>
    </ReportPageShell>
  )
}
