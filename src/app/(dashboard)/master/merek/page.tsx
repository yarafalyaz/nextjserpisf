import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { BrandTable } from "./_components/brand-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Merek" }

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_brands")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const brands = await prisma.brand.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { items: true } },
      categories: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.brand.count({ where })

  const tableData = toPlain(brands)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Merek" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Master Data Merek (Brands)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Katalog prinsipal manufaktur dan pabrikan merek resmi untuk barang dan armada.
          </p>
        </div>
        <CanCreate permission="create_brands">
          <Link
            href="/master/merek/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-brand-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Merek</span>
          </Link>
        </CanCreate>
      </div>

      <BrandTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
