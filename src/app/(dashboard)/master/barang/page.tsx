export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { ItemTable } from "./_components/item-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/page-header"
import { FormSelect } from "@/components/ui/form-select"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Barang" }

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; category?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_items")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    isActive: true,
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { sku: { contains: params.cari } },
        { name: { contains: params.cari } },
      ],
    }),
    ...(params.category && { categoryId: Number(params.category) }),
  }

  const [rawItems, categories] = await Promise.all([
    prisma.item.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: "desc" },
      take,
    skip: (page - 1) * pageSize,
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

  const tableData = toPlain(items)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Item" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Barang</h1>
<Link href="/master/barang/tambah" id="create-item-btn" className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          + Tambah Barang
        </Link>
      </div>

      <ItemTable
        data={tableData}
        toolbar={<AppSearchField placeholder="Cari SKU atau nama item..." action="/master/barang" />}
        filters={
          <form className="flex gap-2" action="/master/barang">
            <FormSelect
              name="category"
              defaultValue={params.category || ""}
              placeholder="Semua Kategori"
              className="min-w-[180px]"
              options={[
                { value: "", label: "Semua Kategori" },
                ...categories.map((cat) => ({ value: String(cat.id), label: cat.name })),
              ]}
            />
            <Button type="submit">Filter</Button>
          </form>
        }
      />
    </div>
  )
}
