export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
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

  const tableData = toPlain(warehouses) as any


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Gudang" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Gudang</h1>
<Link href="/master/gudang/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-warehouse-btn">
          + Tambah Gudang
        </Link>
      </div>

      <WarehouseTable data={tableData} />
    </div>
  )
}
