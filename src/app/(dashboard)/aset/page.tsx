export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AssetTable } from "./_components/asset-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_assets")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
        { location: { contains: params.cari } },
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
          href="/aset/tambah"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
        >
          + Tambah Aset
        </Link>
      </div>

      <AssetTable data={tableData} />
    </div>
  )
}
