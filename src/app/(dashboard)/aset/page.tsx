export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { AssetTable } from "./_components/asset-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  await requirePermission("view_assets")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
        { location: { contains: params.search } },
      ],
    }),
  }

  const assets = await prisma.asset.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(assets))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Aset" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Semua Aset</h1>
        <Link
          href="/assets/create"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
        >
          + Tambah Aset
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama, kode, atau lokasi..." action="/assets" />
        </div>

        <AssetTable data={tableData} />
      </div>
    </div>
  )
}
