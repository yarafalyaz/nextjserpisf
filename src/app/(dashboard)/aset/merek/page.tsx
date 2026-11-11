import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { requirePermission } from "@/lib/auth/permissions"
import { AssetBrandTable } from "./_components/asset-brand-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Merek Kendaraan" }

export default async function AssetBrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_asset_brands")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const brands = await prisma.assetBrand.findMany({
    where,
    orderBy: { name: "asc" },
    include: { _count: { select: { models: true } } },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.assetBrand.count({ where })

  const tableData = toPlain(brands)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Aset", href: "/aset" },
  { label: "Merek" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Merek & Pabrikan Aset</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Katalog produsen peralatan, mesin industri, kendaraan, dan perangkat operasional.
          </p>
        </div>
        <CanCreate permission="create_asset_brands">
          <Link
            href="/aset/merek/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-asset-brand-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Merek</span>
          </Link>
        </CanCreate>
      </div>

      <AssetBrandTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
