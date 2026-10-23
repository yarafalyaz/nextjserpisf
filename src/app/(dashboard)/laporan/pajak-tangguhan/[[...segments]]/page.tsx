export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DeferredTaxCard } from "@/components/reports/deferred-tax-card"
import { DeferredTaxValueEventCard } from "@/components/reports/deferred-tax-value-event-card"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { splitReportSegments } from "@/lib/reports/report-period"
import { loadDeferredTax } from "@/lib/reports/deferred-tax-data"
import { loadDeferredTaxValueEventSource } from "@/lib/reports/deferred-tax-value-events-data"

export const metadata: Metadata = { title: "Pajak Tangguhan" }

/**
 * F-2026-10-23-112 tahap stok + konvergensi F-2026-10-23-124-V: laporan
 * Perbedaan Temporer Pajak Tangguhan.
 *
 * Data dari loader `loadDeferredTax`: tabel, totals, verdict, dan notice
 * tampil apa adanya lewat `DeferredTaxCard` — halaman ini tidak menghitung
 * ulang dan tidak menyediakan tombol jurnal. Tarif badan belum punya master
 * bertanggal efektif, jadi tarif dari path `tarif/<persen>` adalah pasokan
 * operator: diteruskan apa adanya (`loadDeferredTax` menandainya
 * `rateSource: "operator"`) dan caption menyebutnya verbatim dari
 * `report.rateSourceLabel` — bukan tarif resmi/master. Kosong/tidak sah
 * diteruskan apa adanya dan builder menolak menghitung (fail-closed).
 * `asOf` = akhir tahun pajak berjalan.
 *
 * Sumber KEDUA F-2026-10-23-125-V (`loadDeferredTaxValueEventSource`):
 * peristiwa revaluasi/impairment belum terbekukan (inti F-111 belum ada),
 * jadi kartu kedua tampil notice "belum tersedia" bernama dari builder —
 * bukan angka nol — dan PPh final tampil terpisah dari indikasi tangguhan.
 */
export default async function DeferredTaxPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tarif?: string }>
}) {
  const user = await requirePermission("view_reports")
  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  // Tarif dari path (`/tarif/22`); `?tarif=` lama tetap dibaca.
  const rawRate = splitReportSegments(segments).filters.tarif ?? search.tarif
  const parsedRate = rawRate ? Number(rawRate.replace(",", ".")) : null
  const taxRatePercent = parsedRate !== null && Number.isFinite(parsedRate) ? parsedRate : null

  const now = new Date()
  const asOf = new Date(Date.UTC(now.getFullYear(), 11, 31))
  const { report } = await loadDeferredTax({ taxRatePercent, asOf })
  const { report: valueEventReport } = await loadDeferredTaxValueEventSource({ taxRatePercent, asOf })
  const periodLabel = `Per 31 Desember ${now.getFullYear()}`

  return (
    <ReportPageShell
      title="Pajak Tangguhan"
      sheetTitle="Pajak Tangguhan"
      subtitle="Perbedaan Temporer Pajak Tangguhan (Tahap Stok)"
      periodLabel={periodLabel}
      periodCaption={`${periodLabel} · tarif badan ${
        report.taxRatePercent === null
          ? "belum dipasok"
          : report.rateSourceLabel
            ? `${report.taxRatePercent}% (${report.rateSourceLabel})`
            : `${report.taxRatePercent}%`
      } · ${report.totals.fiscalNotFrozen} fiskal belum terbekukan`}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/pajak-tangguhan"
          mode="none"
          defaultStartDate=""
          numberField={{
            param: "tarif",
            label: "Tarif Pajak Badan (%) — pasokan operator",
            value: taxRatePercent === null ? "" : String(taxRatePercent),
            min: 0,
            max: 100,
          }}
        />
      }
      actions={<ExportButtons title="Pajak_Tangguhan" />}
    >
      <DeferredTaxCard report={report} />
      <DeferredTaxValueEventCard report={valueEventReport} />
    </ReportPageShell>
  )
}
