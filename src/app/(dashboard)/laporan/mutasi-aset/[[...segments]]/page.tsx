export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadAssetMovement } from "@/lib/reports/asset-reports-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Mutasi Aset Tetap" }

export default async function AssetMovementPage({
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

  // Baris tabel disusun sekali di sini dan dipakai bersama layar + engine PDF.
  const { movement, periodLabel, periodCaption } = await loadAssetMovement(period)

  return (
    <ReportPageShell
      title="Mutasi Aset Tetap"
      sheetTitle="Mutasi Aset Tetap"
      subtitle="Perubahan Nilai Aset per Periode"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/mutasi-aset"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Mutasi Aset Tetap"
          pdfHref={buildReportPdfHref("mutasi-aset", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={movement.table.columns}
        rows={movement.table.rows}
        tableLabel="Mutasi Aset Tetap"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        Saldo awal nilai buku {formatCurrency(movement.opening.bookValue)} + penambahan{" "}
        {formatCurrency(movement.additions.bookValue)} − penyusutan{" "}
        {formatCurrency(movement.depreciation.accumulated)} − pelepasan{" "}
        {formatCurrency(Math.abs(movement.disposals.bookValue))} = saldo akhir{" "}
        {formatCurrency(movement.closing.bookValue)}.
        {movement.disposalCount > 0 ? ` ${movement.disposalCount} aset dilepas pada periode ini.` : ""}
      </p>
    </ReportPageShell>
  )
}
