export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { splitReportSegments } from "@/lib/reports/report-period"
import { getServiceReminderQueue } from "@/lib/reports/service-reminder-queue-data"
import {
  SERVICE_REMINDER_QUEUE_TITLE,
  SERVICE_REMINDER_WINDOW_CHOICES,
} from "@/lib/reports/service-reminder-queue"
import { ServiceReminderQueueCard } from "@/components/reports/service-reminder-queue-card"

export const metadata: Metadata = { title: SERVICE_REMINDER_QUEUE_TITLE }

/**
 * F-2026-10-25-021-S: antrean pengingat servis berkala per kendaraan
 * baca-saja. Gerbang `view_reports` ditegakkan page + loader fail-closed;
 * status/sisa/ember dari builder apa adanya — halaman tidak menghitung
 * ulang (AC-SV-F1). Telepon pelanggan tidak dimuat loader (BR-SV-06).
 * Tanpa ekspor/PDF tahap ini.
 *
 * Laporan snapshot tanpa periode: jendela (`jendelaDepan`) tinggal di path
 * (`/jendelaDepan/30`), bukan query; `?jendelaDepan=` lama tetap dibaca.
 */
export default async function ServiceReminderReportPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ jendelaDepan?: string }>
}) {
  await requirePermission("view_reports")
  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  // Laporan tanpa periode: segmennya langsung pasangan filter. Nilai dari
  // path (`/jendelaDepan/30`); `?jendelaDepan=` lama tetap dibaca.
  const rawWindow = splitReportSegments(segments).filters.jendelaDepan ?? search.jendelaDepan
  const windowAheadDays = (SERVICE_REMINDER_WINDOW_CHOICES as readonly number[]).includes(
    Number(rawWindow),
  )
    ? Number(rawWindow)
    : undefined
  const queue = await getServiceReminderQueue({ windowAheadDays })

  return (
    <ReportPageShell
      title={SERVICE_REMINDER_QUEUE_TITLE}
      sheet={false}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/servis-berkala"
          mode="none"
          defaultStartDate=""
          selects={[
            {
              param: "jendelaDepan",
              label: "Jendela ke depan (hari)",
              placeholder: "30 hari",
              value: String(queue.windowAheadDays),
              options: SERVICE_REMINDER_WINDOW_CHOICES.map((d) => ({
                value: String(d),
                label: `${d} hari`,
              })),
            },
          ]}
        />
      }
    >
      <ServiceReminderQueueCard queue={queue} />
    </ReportPageShell>
  )
}
