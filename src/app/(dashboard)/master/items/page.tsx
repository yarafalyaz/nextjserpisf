export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { ItemTable } from "./_components/item-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; category?: string }>
}) {
  await requirePermission("view_items")

  const params = await searchParams

  const where = {
    isActive: true,
    deletedAt: null,
    ...(params.search && {
      OR: [
        { sku: { contains: params.search } },
        { name: { contains: params.search } },
      ],
    }),
    ...(params.category && { categoryId: Number(params.category) }),
  }

  const [rawItems, categories] = await Promise.all([
    prisma.item.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.itemCategory.findMany({ orderBy: { name: "asc" } }),
  ])

  const items = rawItems.map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: item.category,
    qtyOnHand: Number(item.qtyOnHand),
    minStock: Number(item.minStock),
    price: Number(item.price),
  }))

  const tableData = JSON.parse(JSON.stringify(items))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Item" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Items</h1>
<Link href="/master/items/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-item-btn">
          + Tambah Item
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari SKU atau nama item..." action="/master/items" />
          <form className="flex gap-2" action="/master/items">
            <select name="category" className="form-input" defaultValue={params.category}>
              <option value="">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <button type="submit" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Filter</button>
          </form>
        </div>

        <ItemTable data={tableData} />
      </div>
    </div>
  )
}
