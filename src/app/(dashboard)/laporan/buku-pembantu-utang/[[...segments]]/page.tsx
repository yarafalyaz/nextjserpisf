export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { reportPeriodFromRoute, splitReportSegments } from "@/lib/reports/report-period"
import { SubledgerReport } from "../../_components/subledger-report"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Buku Besar Pembantu Utang" }

export default async function PayableSubledgerPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ partyId?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission("view_reports")

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  // Periode + pihak kini di path; param lama (`partyId`) tetap dibaca supaya
  // tautan sebelum perpindahan tidak jadi tautan mati.
  const partyKey = splitReportSegments(segments).filters.pihak ?? search.partyId ?? null
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))

  return (
    <ReportPageShell title="Buku Besar Pembantu Utang" sheet={false}>

      <SubledgerReport
        side="AP"
        basePath="/laporan/buku-pembantu-utang"
        partyKey={partyKey}
        startDate={period.start}
        endDate={period.end}
      />
    </ReportPageShell>
  )
}
