export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ReportPageShell } from "@/components/reports/report-page-shell"
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
 */
export default async function ServiceReminderReportPage({
  searchParams,
}: {
  searchParams: Promise<{ jendelaDepan?: string }>
}) {
  await requirePermission("view_reports")
  const params = await searchParams
  const windowAheadDays = (SERVICE_REMINDER_WINDOW_CHOICES as readonly number[]).includes(
    Number(params.jendelaDepan),
  )
    ? Number(params.jendelaDepan)
    : undefined
  const queue = await getServiceReminderQueue({ windowAheadDays })

  return (
    <ReportPageShell
      title={SERVICE_REMINDER_QUEUE_TITLE}
      sheet={false}
      filter={
        <form
          method="get"
          aria-label="Filter jendela pengingat servis berkala"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="report-window-ahead"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              Jendela ke depan (hari)
            </label>
            <select
              id="report-window-ahead"
              name="jendelaDepan"
              defaultValue={String(queue.windowAheadDays)}
              className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
            >
              {SERVICE_REMINDER_WINDOW_CHOICES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-default bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:-translate-y-px hover:shadow-md"
          >
            Terapkan Jendela
          </button>
        </form>
      }
    >
      <ServiceReminderQueueCard queue={queue} />
    </ReportPageShell>
  )
}
