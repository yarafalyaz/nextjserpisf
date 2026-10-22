export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getWarrantyExpiryQueue } from "@/lib/reports/warranty-expiry-queue-data"
import { WARRANTY_EXPIRY_WINDOW_CHOICES } from "@/lib/reports/warranty-expiry-queue"
import { WarrantyExpiryQueueCard } from "@/components/reports/warranty-expiry-queue-card"

export const metadata: Metadata = { title: "Garansi Segera Berakhir" }

/**
 * F-2026-10-22-094-S (Q-WX-3 permukaan laporan): antrean garansi segera
 * berakhir baca-saja. Gerbang `view_reports` (Q-WX-1); loader scope "report"
 * tidak pernah memilih telepon — nama + plat saja, tanpa WA. Ekspor/PDF
 * ditolak tahap 1 (BR-WX-06). UI tidak menghitung sisa hari/ember.
 */
export default async function WarrantyExpiryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ jendelaDepan?: string; jendelaLampau?: string }>
}) {
  await requirePermission("view_reports")
  const params = await searchParams
  const windowAheadDays = (WARRANTY_EXPIRY_WINDOW_CHOICES as readonly number[]).includes(
    Number(params.jendelaDepan),
  )
    ? Number(params.jendelaDepan)
    : undefined
  const windowPastDays = (WARRANTY_EXPIRY_WINDOW_CHOICES as readonly number[]).includes(
    Number(params.jendelaLampau),
  )
    ? Number(params.jendelaLampau)
    : undefined
  const queue = await getWarrantyExpiryQueue("report", { windowAheadDays, windowPastDays })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Garansi Segera Berakhir" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Garansi Segera Berakhir</h1>

      <form
        method="get"
        aria-label="Filter jendela garansi segera berakhir"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-window-ahead" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Jendela ke depan (hari)
          </label>
          <select
            id="report-window-ahead"
            name="jendelaDepan"
            defaultValue={String(queue.windowAheadDays)}
            className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            {WARRANTY_EXPIRY_WINDOW_CHOICES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-window-past" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Jendela lampau (hari)
          </label>
          <select
            id="report-window-past"
            name="jendelaLampau"
            defaultValue={String(queue.windowPastDays)}
            className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            {WARRANTY_EXPIRY_WINDOW_CHOICES.map((d) => (
              <option key={d} value={d}>{d}</option>
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

      <WarrantyExpiryQueueCard queue={queue} />
    </div>
  )
}
