export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { reportPeriodFromRoute, splitReportSegments } from "@/lib/reports/report-period"
import { SubledgerReport } from "../../_components/subledger-report"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Buku Besar Pembantu Piutang" }

export default async function ReceivableSubledgerPage({
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
    <ReportPageShell title="Buku Besar Pembantu Piutang" sheet={false}>

      <SubledgerReport
        side="AR"
        basePath="/laporan/buku-pembantu-piutang"
        partyKey={partyKey}
        startDate={period.start}
        endDate={period.end}
      />
    </ReportPageShell>
  )
}
