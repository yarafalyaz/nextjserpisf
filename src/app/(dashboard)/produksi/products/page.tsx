import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { ProductTable } from "./_components/product-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Produk (BOM)" }

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_production")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  // Use select (not include) to avoid pulling Decimal fields (standardCost)
  // into the RSC→client boundary. Decimal instances crash react-table's
  // internal .map() with "w.map is not a function".
  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { materials: true } },
    },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.product.count({ where })

  const tableData = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    materialsCount: p._count.materials,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi" },
  { label: "Produk (BOM)" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Produk & Resep BOM (Bill of Materials)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Master formula perakitan barang jadi, struktur komponen material, dan standar kebutuhan bahan baku.
          </p>
        </div>
        <CanCreate permission="create_products">
          <Link
            href="/produksi/products/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-product-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Produk</span>
          </Link>
        </CanCreate>
      </div>

      <ProductTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
