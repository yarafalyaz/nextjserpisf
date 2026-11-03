export const dynamic = "force-dynamic"

import { formatDate } from "@/lib/utils/format"
import type { Metadata } from "next"
import Link from "next/link"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { MaterialPlanningCard } from "@/components/reports/material-planning-card"
import { splitReportSegments } from "@/lib/reports/report-period"
import { loadMaterialPlanning } from "@/lib/reports/material-planning-data"
import { buildMaterialPlanRequestHref } from "@/lib/reports/material-planning"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"

export const metadata: Metadata = { title: "Perencanaan Material" }

/**
 * Perencanaan material (MRP-Lite, report-only): agregat kebutuhan pesan
 * per barang atas angka posisi kini. Laporan tanpa periode: segmennya
 * langsung pasangan filter. Gudang dari path (`/gudang/<slug>`);
 * `?warehouseId=` lama tetap dibaca.
 */
export default async function MaterialPlanningPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ warehouseId?: string }>
}) {
  const user = await requirePermission("view_reports")

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const { filters } = splitReportSegments(segments)
  const warehouseKey = filters.gudang ?? search.warehouseId ?? null

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: "asc" },
  })

  const warehouseRow = warehouseKey
    ? (warehouses.find((w) => w.slug === warehouseKey) ??
      warehouses.find((w) => String(w.id) === warehouseKey) ??
      null)
    : null

  const asOf = new Date()
  const scope = await getWarehouseScope({ id: user.id, roles: user.roles ?? [] })
  // ROUND5-SCOPE: undefined = all-access; array (termasuk kosong) = ditegakkan.
  const scopeIds: number[] | undefined =
    scope.kind === "all" ? undefined : scope.kind === "assigned" ? scope.warehouseIds : []

  // Putaran 91: scope ditegakkan di loader (sebelumnya hanya daftar baris
  // disaring di halaman, angka agregat per barang + totals tetap global).
  const { plan, pairLines, usageWindowDays, usageWindowStart } =
    await loadMaterialPlanning(scopeIds)

  const visiblePairs = pairLines.filter((line) => {
    if (warehouseRow && line.warehouseId !== warehouseRow.id) return false
    return true
  })
  const visiblePlan = {
    ...plan,
    lines: plan.lines.filter((planLine) =>
      visiblePairs.some((pair) => pair.itemId === planLine.itemId),
    ),
  }
  const pairResult = {
    lines: visiblePairs,
    counts: {
      assessed: visiblePairs.filter((l) => l.status !== "tidak_dinilai").length,
      notAssessed: visiblePairs.filter((l) => l.status === "tidak_dinilai").length,
      orderNow: visiblePairs.filter((l) => l.status === "pesan_sekarang").length,
      critical: visiblePairs.filter((l) => l.isCritical).length,
    },
  }

  const requestHref = buildMaterialPlanRequestHref(visiblePlan)
  const canCreateRequest =
    requestHref !== null &&
    (user.roles.includes("super_admin") || user.permissions.includes("create_purchase_requests"))

  return (
    <ReportPageShell
      title="Perencanaan Material"
      sheet={false}
      wide
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/perencanaan-material"
          mode="none"
          defaultStartDate=""
          selects={[
            {
              param: "gudang",
              label: "Gudang",
              placeholder: "Semua Gudang",
              value: warehouseRow ? (warehouseRow.slug ?? String(warehouseRow.id)) : "",
              options: warehouses.map((w) => ({
                value: w.slug ?? String(w.id),
                label: `${w.code} - ${w.name}`,
              })),
            },
          ]}
        />
      }
      actions={
        <div className="flex items-center gap-2">
          {canCreateRequest ? (
            <Link
              href={requestHref}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-md"
            >
              Buat Permintaan dari Perencanaan
            </Link>
          ) : null}
          <ExportButtons title="Perencanaan Material" />
        </div>
      }
    >
      <ReportLetterhead
        title="Perencanaan Material (MRP-Lite)"
        subtitle="Agregat Kebutuhan Pesan per Barang — Baca Saja"
        periodLabel={`Per ${formatDate(asOf)}`}
      />
      <MaterialPlanningCard
        plan={visiblePlan}
        pairResult={pairResult}
        usageWindowDays={usageWindowDays}
        usageWindowStartLabel={formatDate(usageWindowStart)}
      />
    </ReportPageShell>
  )
}
