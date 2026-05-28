export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { requirePermission } from "@/lib/auth/permissions"
import { AssetCategoryTable } from "./_components/asset-category-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function AssetCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_assets")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const categories = await prisma.assetCategory.findMany({
    where,
    orderBy: { name: "asc" },
    select: { id: true, name: true, depreciationRate: true, usefulLife: true },
  })

  const data = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    depreciationRate: cat.depreciationRate ? Number(cat.depreciationRate) : null,
    usefulLife: cat.usefulLife,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Assets", href: "/aset" },
  { label: "Categories" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Kategori Aset</h1>
        <Link href="/aset/kategori/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-asset-cat-btn">
          + Tambah Kategori
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama kategori..." action="/aset/kategori" />
        </div>

        <AssetCategoryTable data={data} />
      </div>
    </div>
  )
}
