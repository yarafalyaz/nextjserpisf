import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { WarehouseTable } from "./_components/warehouse-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Gudang" }

export default async function WarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_warehouses")
  const canCreate = await hasPermission("create_warehouses")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    isActive: true,
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
      ],
    }),
  }

  const warehouses = await prisma.warehouse.findMany({
    where,
    include: { racks: true },
    orderBy: { name: "asc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.warehouse.count({ where })

  const tableData = toPlain(warehouses)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Gudang" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Master Fasilitas Gudang (Warehouses)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Lokasi fisik penyimpanan logistik, topologi rak WMS, dan pengaturan cakupan staf gudang.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/master/gudang/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-warehouse-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Gudang</span>
          </Link>
        )}
      </div>

      <WarehouseTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
