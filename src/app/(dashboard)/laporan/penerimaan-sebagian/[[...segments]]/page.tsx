export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { parseReportPeriod } from "@/lib/reports/report-period"
import { loadPurchaseOutstanding } from "@/lib/reports/purchase-outstanding-data"
import { purchaseOutstandingSummary } from "@/lib/reports/purchase-outstanding"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Barang Diterima Sebagian" }

/**
 * Barang diterima sebagian — daftar tindak lanjut pesanan pembelian yang barisnya
 * belum diterima penuh: dipesan, sudah masuk, kurang, dan nilai sisanya.
 */
export default async function PurchaseOutstandingPage({
  params: routeParams,
}: {
  params: Promise<{ segments?: string[] }>
}) {
  const user = await requirePermission("view_reports")
  const params = await routeParams

  const now = new Date()
  const period = parseReportPeriod(params.segments?.[0], {
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  })

  const { outstanding, periodLabel, periodCaption } = await loadPurchaseOutstanding(period)

  return (
    <ReportPageShell
      title="Barang Diterima Sebagian"
      sheetTitle="Barang Diterima Sebagian"
      subtitle="Sisa Penerimaan Pesanan Pembelian"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/penerimaan-sebagian"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Barang Diterima Sebagian"
          pdfHref={buildReportPdfHref("penerimaan-sebagian", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={outstanding.table.columns}
        rows={outstanding.table.rows}
        tableLabel="Barang Diterima Sebagian"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {purchaseOutstandingSummary(outstanding)} · sisa dihitung dari kuantitas diterima yang dipelihara hook
        penerimaan barang; kuantitas lintas satuan tidak dijumlahkan.
      </p>
    </ReportPageShell>
  )
}
