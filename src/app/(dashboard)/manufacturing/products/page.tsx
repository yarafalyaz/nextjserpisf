export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { ProductTable } from "./_components/product-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const params = await searchParams

  const where = {
    ...(params.search && {
      name: { contains: params.search },
    }),
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { materials: { select: { id: true } } },
  })

  const tableData = JSON.parse(JSON.stringify(products))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Manufacturing", href: "/manufacturing" },
  { label: "Products" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Products</h1>
        <Link href="/manufacturing/products/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-product-btn">
          + Tambah Product
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama produk..." action="/manufacturing/products" />
        </div>

        <ProductTable data={tableData} />
      </div>
    </div>
  )
}
