export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { inventoryReconciliationSummary } from "@/lib/reports/inventory-reconciliation"
import { loadInventoryReconciliation } from "@/lib/reports/inventory-reconciliation-data"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"

export const metadata: Metadata = { title: "Selisih Saldo Akun Persediaan" }

export default async function InventoryReconciliationPage({
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

  const { reconciliation, periodLabel, periodCaption } = await loadInventoryReconciliation(period)

  return (
    <ReportPageShell
      title="Selisih Saldo Akun Persediaan"
      sheetTitle="Selisih Saldo Akun Persediaan dengan Nilai Barang"
      subtitle="Pemeriksaan: Buku Besar dibanding Nilai Barang"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/selisih-persediaan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Selisih Saldo Akun Persediaan"
          pdfHref={buildReportPdfHref("selisih-persediaan", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={reconciliation.table.columns}
        rows={reconciliation.table.rows}
        tableLabel="Selisih Saldo Akun Persediaan dengan Nilai Barang"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {inventoryReconciliationSummary(reconciliation)}
      </p>
    </ReportPageShell>
  )
}
