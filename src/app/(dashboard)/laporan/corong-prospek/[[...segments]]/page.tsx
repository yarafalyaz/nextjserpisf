export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { getLeadFunnel } from "@/lib/reports/lead-funnel-data"
import { LeadFunnelCard } from "@/components/reports/lead-funnel-card"
import { getLeadExpectedCloseQueue } from "@/lib/reports/lead-expected-close-data"
import { LeadExpectedCloseCard } from "@/components/reports/lead-expected-close-card"

export const metadata: Metadata = { title: "Corong Prospek" }

/**
 * F-2026-10-22-092-S (Q-LF-2 permukaan laporan): corong prospek periode.
 *
 * Gerbang `view_reports` (Q-LF-1); loader scope "report" menyertakan
 * pemecahan per penanggung bernama. Ekspor/PDF ditunda tahap 1 per
 * putusan Q-LF-2 — layar agregat saja, tanpa daftar nama/kontak (Q-LF-4).
 * UI tidak menghitung ulang: semua angka dari builder `lead-funnel.ts`.
 *
 * F-2026-10-25-027-S (Q-EC-4): kartu antrean target tutup tambahan di
 * halaman ini (bukan route baru). Permukaan tetap `view_reports`;
 * tautan detail per baris butuh `view_leads` — tanpa izin tautan
 * nonaktif tertanda, baris tetap tampil (Q-EC-2/BR-EC-08). Antrean
 * adalah potret saat ini, tidak disaring periode corong di atasnya.
 */
export default async function LeadFunnelPage({
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

  const funnel = await getLeadFunnel("report", { start: period.start, end: period.end })

  const [expectedCloseQueue, canViewLeads] = await Promise.all([
    getLeadExpectedCloseQueue(),
    hasPermission("view_leads"),
  ])

  const periodCaption = `Periode ${period.start.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} – ${period.end.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`

  return (
    <ReportPageShell
      title="Corong Prospek"
      sheetTitle="Corong Prospek"
      subtitle="Posisi Saat Ini dan Corong Gerakan Periode Prospek"
      periodLabel={periodCaption}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/corong-prospek"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <LeadFunnelCard funnel={funnel} />
        <LeadExpectedCloseCard queue={expectedCloseQueue} canViewLeads={canViewLeads} />
      </div>
    </ReportPageShell>
  )
}
