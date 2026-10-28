export const dynamic = "force-dynamic"

import { formatDate } from "@/lib/utils/format"
import type { Metadata } from "next"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { splitReportSegments } from "@/lib/reports/report-period"
import { serialBatchSummary } from "@/lib/reports/serial-batch-stock"
import { loadSerialBatchStock } from "@/lib/reports/serial-batch-stock-data"

export const metadata: Metadata = { title: "Stok Nomor Seri/Batch" }

/**
 * Posisi stok nomor seri/batch per gudang. Laporan tanpa periode: segmennya
 * langsung pasangan filter. Gudang dari path (`/gudang/<slug>`); `?warehouseId=`
 * lama tetap dibaca.
 */
export default async function SerialBatchStockPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ warehouseId?: string }>
}) {
  const user = await requirePermission("view_reports")

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const { filters } = splitReportSegments(segments)
  const warehouseKey = filters.gudang ?? search.warehouseId ?? null

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: "asc" },
  })

  const warehouseRow = warehouseKey
    ? (warehouses.find((w) => w.slug === warehouseKey) ??
      warehouses.find((w) => String(w.id) === warehouseKey) ??
      null)
    : null
  const warehouseId = warehouseRow?.id ?? null

  const asOf = new Date()
  const { report } = await loadSerialBatchStock({ warehouseId, asOf })
  const periodLabel = `Per ${formatDate(asOf)}`

  return (
    <ReportPageShell
      title="Stok Nomor Seri/Batch"
      sheet={false}
      wide
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/nomor-seri-batch"
          mode="none"
          defaultStartDate=""
          selects={[
            {
              param: "gudang",
              label: "Gudang",
              placeholder: "Semua Gudang",
              value: warehouseRow ? (warehouseRow.slug ?? String(warehouseRow.id)) : "",
              options: warehouses.map((w) => ({
                value: w.slug ?? String(w.id),
                label: `${w.code} - ${w.name}`,
              })),
            },
          ]}
        />
      }
      actions={<ExportButtons title="Stok Nomor Seri/Batch" />}
    >
      <ReportLetterhead
        title="Stok Nomor Seri/Batch"
        subtitle="Posisi per Gudang"
        periodLabel={periodLabel}
      />
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Stok Nomor Seri/Batch"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {serialBatchSummary(report)}
      </p>
    </ReportPageShell>
  )
}
