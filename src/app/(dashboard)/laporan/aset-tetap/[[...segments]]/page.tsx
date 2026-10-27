export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { parseReportFilters } from "@/lib/reports/report-href"
import { loadAssetRegister } from "@/lib/reports/asset-reports-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Daftar Aset Tetap" }

/** Sakelar "ikutkan aset yang sudah dilepas" — dipakai filter, halaman, dan PDF. */
const INCLUDE_DISPOSED_PARAM = "termasukDilepas"

export default async function AssetRegisterPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")
  const [params, search] = await Promise.all([routeParams, searchParams])

  // Laporan posisi: slug periode berarti "per akhir periode" (2026-10 → 31 Okt
  // 2026). Periode dibaca hanya via helper bersama supaya tautan lama
  // ?tanggalMulai=&tanggalSelesai= tetap menampilkan posisi yang diminta.
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: now,
    end: now,
  }))
  const asOfDate = new Date(period.end)
  // Sakelar kini berada di path (`/termasukDilepas/1`); param query lama tetap
  // dibaca supaya tautan sebelum perpindahan tidak jadi tautan mati.
  const includeDisposed =
    parseReportFilters(params.segments?.slice(1) ?? [])[INCLUDE_DISPOSED_PARAM] === "1" ||
    search[INCLUDE_DISPOSED_PARAM] === "1"

  // Baris tabel disusun sekali di sini dan dipakai bersama layar + engine PDF.
  const { register, periodLabel, periodCaption } = await loadAssetRegister(asOfDate, includeDisposed)

  return (
    <ReportPageShell
      title="Daftar Aset Tetap"
      sheetTitle="Daftar Aset Tetap"
      subtitle="Posisi Aset per Tanggal"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/aset-tetap"
          defaultStartDate={toLocalDateOnly(asOfDate)}
          toggle={{
            param: INCLUDE_DISPOSED_PARAM,
            label: "Ikutkan aset yang sudah dilepas",
            checked: includeDisposed,
          }}
        />
      }
      actions={
        <ExportButtons
          title="Daftar Aset Tetap"
          pdfHref={buildReportPdfHref("aset-tetap", period.slug, {
            ...(includeDisposed ? { [INCLUDE_DISPOSED_PARAM]: "1" } : {}),
          })}
        />
      }
    >
      <ReportTableView
        columns={register.table.columns}
        rows={register.table.rows}
        tableLabel="Daftar Aset Tetap"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {register.assetCount} aset di buku — harga perolehan {formatCurrency(register.totalCost)}, akumulasi
        penyusutan {formatCurrency(register.totalAccumulatedDepreciation)}, nilai buku{" "}
        {formatCurrency(register.totalBookValue)}.
        {register.disposedCount > 0
          ? ` ${register.disposedCount} aset sudah dilepas dan tidak ikut dihitung.`
          : ""}
      </p>
    </ReportPageShell>
  )
}
