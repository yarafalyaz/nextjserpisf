export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { RackTable } from "./_components/rack-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { Plus } from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Rak Gudang" }

export default async function RacksPage({
  searchParams,
}: {
  searchParams: Promise<{
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  await requirePermission("view_racks")

  const params = await searchParams
  const cari = params.cari?.trim()

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(cari && {
      OR: [
        { name: { contains: cari } },
        { code: { contains: cari } },
        { warehouse: { name: { contains: cari } } },
      ],
    }),
  }

  const [racks, total, allRacksTotal, totalRackRowsCount, emptyRacksCount, warehousesWithRacks] =
    await Promise.all([
      prisma.rack.findMany({
        where,
        include: {
          warehouse: { select: { id: true, name: true, slug: true, code: true } },
          rows: { select: { id: true } },
        },
        take,
        skip: (page - 1) * pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.rack.count({ where }),
      prisma.rack.count(),
      prisma.rackRow.count(),
      prisma.rack.count({ where: { rows: { none: {} } } }),
      prisma.rack.groupBy({ by: ["warehouseId"] }),
    ])

  const tableData = toPlain(racks)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Rak" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Rak Penyimpanan Gudang
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Manajemen struktur lorong dan rak penyimpanan fisik per lokasi gudang (WMS Storage Rack).
          </p>
        </div>
        <CanCreate permission="create_warehouses">
          <Link
            href="/inventaris/rak/tambah"
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
            id="create-rack-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Rak</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Rak
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {allRacksTotal}
            </span>
            <span className="text-xs text-muted-foreground">unit rak</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Baris / Bin
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-primary">
              {totalRackRowsCount}
            </span>
            <span className="text-xs text-muted-foreground">lokasi baris</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Gudang Terpetakan
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              {warehousesWithRacks.length}
            </span>
            <span className="text-xs text-muted-foreground">gudang aktif</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Rak Belum Berbaris
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
              {emptyRacksCount}
            </span>
            <span className="text-xs text-muted-foreground">perlu baris rak</span>
          </div>
        </div>
      </div>

      <RackTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
