export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { ItemCategoryTable } from "./_components/item-category-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ItemCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  const params = await searchParams

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const categories = await prisma.itemCategory.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(categories))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Kategori Item" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Kategori Barang</h1>
        <Link href="/master/kategori-barang/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-item-category-btn">
          + Tambah Kategori
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama kategori..." action="/master/kategori-barang" />
        </div>

        <ItemCategoryTable data={tableData} />
      </div>
    </div>
  )
}
