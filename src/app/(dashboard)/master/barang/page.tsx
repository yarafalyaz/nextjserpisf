export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { ItemTable } from "./_components/item-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/page-header"

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
        <h1 className="text-2xl font-bold text-foreground">Barang</h1>
<Link href="/master/barang/create" id="create-item-btn" className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
          + Tambah Item
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari SKU atau nama item..." action="/master/barang" />
          <form className="flex gap-2" action="/master/barang">
            <select name="category" className="form-input" defaultValue={params.category}>
              <option value="">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <Button >Filter</Button>
          </form>
        </div>

        <ItemTable data={tableData} />
      </div>
    </div>
  )
}
