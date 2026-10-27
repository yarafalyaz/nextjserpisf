export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadJobOrderCost } from "@/lib/reports/job-order-data"
import { jobOrderCostSummary } from "@/lib/reports/job-order-cost"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Bahan & Biaya Pekerjaan" }

/**
 * Bahan & biaya per pekerjaan pesanan — berapa biaya yang sudah diserap tiap
 * perintah kerja dan berapa biayanya per unit yang selesai.
 *
 * Dikelompokkan per bulan seperti laporan "Bahan dan Biaya Pekerjaan per Bulan"
 * milik Accurate, tetapi dengan detail per pekerjaan di dalamnya.
 */
export default async function JobOrderCostPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  // Periode dibaca hanya via helper bersama supaya tautan lama
  // ?tanggalMulai=&tanggalSelesai= tetap menampilkan periode yang diminta.
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const { cost, periodLabel, periodCaption } = await loadJobOrderCost(period)

  return (
    <ReportPageShell
      title="Bahan & Biaya Pekerjaan"
      sheetTitle="Bahan & Biaya Pekerjaan"
      subtitle="Bahan, Biaya Produksi & Biaya per Unit"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/biaya-pekerjaan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Bahan & Biaya Pekerjaan"
          pdfHref={buildReportPdfHref("biaya-pekerjaan", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={cost.table.columns}
        rows={cost.table.rows}
        tableLabel="Bahan & Biaya Pekerjaan"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {jobOrderCostSummary(cost)} · bahan dihitung dari pengeluaran bahan yang sudah selesai, biaya
        produksi dari penyerapan biaya (tenaga kerja, mesin, overhead, subkontrak).
      </p>
    </ReportPageShell>
  )
}
