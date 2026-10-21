export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { requirePermission } from "@/lib/auth/permissions"
import type { PermissionName } from "@/lib/setup/base-data"

/**
 * Izin aksi dokumen pajak dari F-034 (PR #301, belum di main saat file ini
 * ditulis): faktur = `create_tax_invoices`, bupot =
 * `manage_withholding_certificates`. ponytail: literal + cast lokal supaya
 * tsc main bersih; sesudah #301 merged pakai literal polos, hapus konstanta.
 */
const CREATE_TAX_INVOICES = "create_tax_invoices" as PermissionName
const MANAGE_WITHHOLDING_CERTIFICATES = "manage_withholding_certificates" as PermissionName
import { CanCreate } from "@/components/auth/can-create"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { loadTaxSummarySpt } from "@/lib/reports/tax-summary-data"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"

export const metadata: Metadata = { title: "Pajak" }

/**
 * Halaman layar Laporan Pajak (F-2026-10-21-001..006, tahap frontend).
 *
 * Satu sumber kebenaran dengan PDF `pajak` dan halaman Posisi SPT:
 * `loadTaxSummarySpt` atas read-model SPT (`loadSptPeriodRowsForRange`).
 * Angka per masa — keluaran, pengurang retur, masukan, neto, kewajiban
 * jurnal, selisih, disetor, sisa — tampil apa adanya dari builder; halaman
 * ini tidak meng-query dokumen mentah dan tidak menghitung ulang pajak.
 * Masa tanpa dokumen TaxInvoice tetap berlabel legacy dari builder.
 */
export default async function TaxReportPage({
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

  const { table, periodLabel, periodCaption } = await loadTaxSummarySpt(period)

  return (
    <ReportPageShell
      title="Pajak"
      sheetTitle="Laporan Pajak (PPN)"
      subtitle="Posisi SPT per Masa: Dokumen vs Jurnal POSTED vs Setor"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/pajak"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <>
          <CanCreate permission={CREATE_TAX_INVOICES}>
            <Link
              href="/keuangan/dokumen-pajak/faktur/tambah"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-default bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:-translate-y-px hover:shadow-md"
            >
              Terbitkan Faktur Pajak
            </Link>
          </CanCreate>
          <CanCreate permission={MANAGE_WITHHOLDING_CERTIFICATES}>
            <Link
              href="/keuangan/dokumen-pajak/bupot/tambah"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-default bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:-translate-y-px hover:shadow-md"
            >
              Terbitkan Bukti Potong
            </Link>
          </CanCreate>
          <ExportButtons
            title="Laporan_Pajak"
            pdfHref={buildReportPdfHref("pajak", period.slug)}
          />
        </>
      }
    >
      <ReportTableView columns={table.columns} rows={table.rows} tableLabel="Laporan Pajak (PPN)" />
    </ReportPageShell>
  )
}
