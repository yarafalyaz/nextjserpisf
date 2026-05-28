export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { BrandTable } from "./_components/brand-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function BrandsPage({
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

  const brands = await prisma.brand.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  })

  const tableData = JSON.parse(JSON.stringify(brands))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Brands" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Merek</h1>
        <Link href="/master/merek/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-brand-btn">
          + Tambah Brand
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama brand..." action="/master/merek" />
        </div>

        <BrandTable data={tableData} />
      </div>
    </div>
  )
}
