export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { reportPeriodFromRoute, splitReportSegments } from "@/lib/reports/report-period"
import { SubledgerReport } from "../../_components/subledger-report"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { buildReportPeriodSlug } from "@/lib/reports/report-period"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { prisma } from "@/lib/db/prisma"

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

  const customers = await prisma.customer.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, slug: true },
  })
  const selected = partyKey
    ? customers.find((p) => p.slug === partyKey) ?? customers.find((p) => String(p.id) === partyKey) ?? null
    : null

  return (
    <ReportPageShell
      title="Buku Besar Pembantu Piutang"
      sheet={false}
      actions={
        selected ? (
          <ExportButtons
            title="Buku_Pembantu_Piutang"
            pdfHref={buildReportPdfHref(
              "buku-pembantu-piutang",
              buildReportPeriodSlug(period.start, period.end),
              { pihak: selected ? (selected.slug ?? String(selected.id)) : "" },
            )}
          />
        ) : null
      }
      filter={
        <ReportPeriodFilter
          basePath="/laporan/buku-pembantu-piutang"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          selects={[
            {
              param: "pihak",
              label: "Pelanggan",
              placeholder: "Cari pelanggan...",
              required: true,
              value: selected ? (selected.slug ?? String(selected.id)) : "",
              options: customers.map((p) => ({
                value: p.slug ?? String(p.id),
                label: `${p.code ? `${p.code} — ` : ""}${p.name}`,
              })),
            },
          ]}
        />
      }
    >
      <SubledgerReport
        side="AR"
        basePath="/laporan/buku-pembantu-piutang"
        partyKey={partyKey}
        startDate={period.start}
        endDate={period.end}
        hideFilterAndActions={true}
      />
    </ReportPageShell>
  )
}
