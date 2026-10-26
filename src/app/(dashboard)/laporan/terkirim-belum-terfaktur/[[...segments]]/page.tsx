export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import {
  DeliveredUnbilledQueueCard,
  DELIVERED_UNBILLED_TITLE,
} from "@/components/reports/delivered-unbilled-queue-card"
import { getDeliveredUnbilledQueue } from "@/lib/reports/delivered-unbilled-data"
import {
  loadReportPeriodCustomer,
  reportCustomerSelect,
} from "@/lib/reports/report-customer-options"
import { formatPeriodLabel } from "@/lib/reports/report-period"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { toLocalDateOnly } from "@/lib/utils/date-only"

export const metadata: Metadata = { title: DELIVERED_UNBILLED_TITLE }

/**
 * F-2026-10-26-058-S — Terkirim Belum Terfaktur (keluarga Laporan Penjualan).
 * Fail-closed `view_reports` sebelum loader; angka/totals/urutan dari
 * payload server apa adanya — halaman tidak menghitung ulang. Periode di
 * path menyaring tanggal dokumen SO lewat loader; pelanggan opsional
 * (`pelanggan/<slug|id>`, query lama `customerId` tetap dibaca). Baca-saja:
 * tindak lanjut hanya tautan detail SO di kartu.
 */
export default async function DeliveredUnbilledPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  const { period, customers, selected } = await loadReportPeriodCustomer(routeParams, searchParams)

  const queue = await getDeliveredUnbilledQueue({
    start: period.start,
    end: period.end,
    ...(selected ? { customerId: selected.id } : {}),
  })

  const periodLabel = formatPeriodLabel(period)

  return (
    <ReportPageShell
      title={DELIVERED_UNBILLED_TITLE}
      sheetTitle={DELIVERED_UNBILLED_TITLE}
      subtitle="Pesanan Penjualan Terkirim Belum Terfaktur Penuh"
      periodLabel={periodLabel}
      periodCaption={periodLabel}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/terkirim-belum-terfaktur"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          selects={[
            reportCustomerSelect({
              customers,
              selected,
              placeholder: "Semua Pelanggan",
            }),
          ]}
        />
      }
      actions={
        <ExportButtons
          title={DELIVERED_UNBILLED_TITLE}
          pdfHref={buildReportPdfHref(
            "terkirim-belum-terfaktur",
            period.slug,
            selected ? { pelanggan: String(selected.id) } : undefined,
          )}
        />
      }
    >
      <DeliveredUnbilledQueueCard queue={queue} />
    </ReportPageShell>
  )
}
