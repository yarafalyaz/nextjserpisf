export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { requirePermission } from "@/lib/auth/permissions"
import { AssetCategoryTable } from "./_components/asset-category-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Kategori" }

export default async function AssetCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_asset_categories")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const categories = await prisma.assetCategory.findMany({
    where,
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, depreciationRate: true, usefulLife: true, taxGroupCode: true, taxTypeListed: true, taxDjpDetermination: true, fiscalMethod: true },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.assetCategory.count({ where })

  const data = categories.map((cat) => ({
    id: cat.id,
    slug: cat.slug,
    name: cat.name,
    depreciationRate: cat.depreciationRate ? Number(cat.depreciationRate) : null,
    usefulLife: cat.usefulLife,
    taxGroupCode: cat.taxGroupCode,
    taxTypeListed: cat.taxTypeListed,
    taxDjpDetermination: cat.taxDjpDetermination,
    fiscalMethod: cat.fiscalMethod,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Aset", href: "/aset" },
  { label: "Kategori" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Kategori Aset</h1>
        <CanCreate permission="create_asset_categories">
          <Link href="/aset/kategori/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-asset-cat-btn">
          + Tambah Kategori
        </Link>
        </CanCreate>
      </div>

      <AssetCategoryTable data={data} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
