export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { requirePermission } from "@/lib/auth/permissions"

/**
 * Izin aksi dokumen pajak dari F-034 (PR #301, di main): faktur =
 * `create_tax_invoices`, bupot = `manage_withholding_certificates`;
 * settle tetap `create_tax_payments`.
 */
import { CanCreate } from "@/components/auth/can-create"
import { hasPermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { DownPaymentTaxPanel } from "@/app/(dashboard)/keuangan/dokumen-pajak/_components/down-payment-tax-panel"
import { loadDownPaymentTaxStatusRows } from "@/lib/reports/down-payment-tax-status-data"
import { loadTaxSummarySpt } from "@/lib/reports/tax-summary-data"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"

export const metadata: Metadata = { title: "Pajak" }

/**
 * Halaman layar Laporan Pajak (F-2026-10-21-001..006, tahap frontend).
 *
 * Satu sumber kebenaran dengan ekspor PDF halaman ini (kunci registry
 * `posisi-spt`) dan halaman Posisi SPT: `loadTaxSummarySpt` atas
 * read-model SPT (`loadSptPeriodRowsForRange`) — layar dan PDF bentuk
 * tabel yang sama persis, bukan rincian per dokumen.
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
  const [dpTaxRows, canIssueDpTax] = await Promise.all([
    loadDownPaymentTaxStatusRows({ confirmedOnly: true }),
    hasPermission("create_tax_invoices"),
  ])

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
          <CanCreate permission="create_tax_invoices">
            <Link
              href="/keuangan/dokumen-pajak/faktur/tambah"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-default bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:-translate-y-px hover:shadow-md"
            >
              Terbitkan Faktur Pajak
            </Link>
          </CanCreate>
          <CanCreate permission="manage_withholding_certificates">
            <Link
              href="/keuangan/dokumen-pajak/bupot/tambah"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-default bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:-translate-y-px hover:shadow-md"
            >
              Terbitkan Bukti Potong
            </Link>
          </CanCreate>
          <ExportButtons
            title="Laporan_Pajak"
            pdfHref={buildReportPdfHref("posisi-spt", period.slug)}
          />
        </>
      }
    >
      <ReportTableView columns={table.columns} rows={table.rows} tableLabel="Laporan Pajak (PPN)" />
      <div className="mt-6">
        <DownPaymentTaxPanel rows={dpTaxRows} canIssue={canIssueDpTax} />
      </div>
    </ReportPageShell>
  )
}
