export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { splitReportSegments } from "@/lib/reports/report-period"
import { getWarrantyExpiryQueue } from "@/lib/reports/warranty-expiry-queue-data"
import { WARRANTY_EXPIRY_WINDOW_CHOICES } from "@/lib/reports/warranty-expiry-queue"
import { WarrantyExpiryQueueCard } from "@/components/reports/warranty-expiry-queue-card"

export const metadata: Metadata = { title: "Garansi Segera Berakhir" }

/**
 * F-2026-10-22-094-S (Q-WX-3 permukaan laporan): antrean garansi segera
 * berakhir baca-saja. Gerbang `view_reports` (Q-WX-1); loader scope "report"
 * tidak pernah memilih telepon — nama + plat saja, tanpa WA. Ekspor/PDF
 * ditolak tahap 1 (BR-WX-06). UI tidak menghitung sisa hari/ember.
 *
 * Laporan snapshot tanpa periode: jendela (`jendelaDepan`/`jendelaLampau`)
 * tinggal di path (`/jendelaDepan/30/jendelaLampau/30`), bukan query;
 * `?jendelaDepan=`/`?jendelaLampau=` lama tetap dibaca.
 */
export default async function WarrantyExpiryReportPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ jendelaDepan?: string; jendelaLampau?: string }>
}) {
  await requirePermission("view_reports")
  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  // Laporan tanpa periode: segmennya langsung pasangan filter. Nilai dari
  // path (`/jendelaDepan/30`); `?jendelaDepan=`/`?jendelaLampau=` lama tetap dibaca.
  const { filters } = splitReportSegments(segments)
  const windowAheadDays = (WARRANTY_EXPIRY_WINDOW_CHOICES as readonly number[]).includes(
    Number(filters.jendelaDepan ?? search.jendelaDepan),
  )
    ? Number(filters.jendelaDepan ?? search.jendelaDepan)
    : undefined
  const windowPastDays = (WARRANTY_EXPIRY_WINDOW_CHOICES as readonly number[]).includes(
    Number(filters.jendelaLampau ?? search.jendelaLampau),
  )
    ? Number(filters.jendelaLampau ?? search.jendelaLampau)
    : undefined
  const queue = await getWarrantyExpiryQueue("report", { windowAheadDays, windowPastDays })

  const windowOptions = WARRANTY_EXPIRY_WINDOW_CHOICES.map((d) => ({
    value: String(d),
    label: `${d} hari`,
  }))

  return (
    <ReportPageShell
      title="Garansi Segera Berakhir"
      sheet={false}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/garansi-segera-berakhir"
          mode="none"
          defaultStartDate=""
          selects={[
            {
              param: "jendelaDepan",
              label: "Jendela ke depan (hari)",
              placeholder: "30 hari",
              value: String(queue.windowAheadDays),
              options: windowOptions,
            },
            {
              param: "jendelaLampau",
              label: "Jendela lampau (hari)",
              placeholder: "30 hari",
              value: String(queue.windowPastDays),
              options: windowOptions,
            },
          ]}
        />
      }
    >
      <WarrantyExpiryQueueCard queue={queue} />
    </ReportPageShell>
  )
}
