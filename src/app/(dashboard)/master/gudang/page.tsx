export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { WarehouseTable } from "./_components/warehouse-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function WarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  await requirePermission("view_warehouses")

  const params = await searchParams

  const where = {
    isActive: true,
    deletedAt: null,
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
      ],
    }),
  }

  const warehouses = await prisma.warehouse.findMany({
    where,
    include: { racks: true },
    orderBy: { name: "asc" },
  })

  const tableData = JSON.parse(JSON.stringify(warehouses))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Gudang" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Gudang</h1>
<Link href="/master/gudang/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-warehouse-btn">
          + Tambah Gudang
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama atau kode..." action="/master/gudang" />
        </div>

        <WarehouseTable data={tableData} />
      </div>
    </div>
  )
}
