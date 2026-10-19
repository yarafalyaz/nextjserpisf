export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadProductionVariance } from "@/lib/reports/production-variance-data"
import { productionVarianceSummary } from "@/lib/reports/production-variance"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Varians Produksi" }

/**
 * Varians produksi per perintah produksi — standar vs aktual dipecah jadi
 * selisih harga bahan, selisih pemakaian, dan tenaga kerja & lainnya.
 * Read-model dari kolom existing; jurnal disposisi tidak dibangun di sini
 * (default mati sesuai putusan manager F-2026-10-20-01).
 */
export default async function ProductionVariancePage({
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

  const { variance, periodLabel, periodCaption } = await loadProductionVariance(period)

  return (
    <ReportPageShell
      title="Varians Produksi"
      sheetTitle="Varians Produksi"
      subtitle="Selisih Harga Bahan, Pemakaian, Tenaga Kerja & Lainnya"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/varians-produksi"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Varians Produksi"
          pdfHref={buildReportPdfHref("varians-produksi", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={variance.table.columns}
        rows={variance.table.rows}
        tableLabel="Varians Produksi"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {productionVarianceSummary(variance)} · baris standar nol ditandai tidak terkalibrasi dan tidak
        dijurnalkan sebagai disposisi.
      </p>
    </ReportPageShell>
  )
}
