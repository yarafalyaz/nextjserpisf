export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CostCenterTable } from "./_components/cost-center-table"

export default async function CostCentersPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_cost_centers")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { code: { contains: params.cari } },
        { name: { contains: params.cari } },
      ],
    }),
  }

  const costCenters = await prisma.costCenter.findMany({
    where,
    orderBy: { name: "asc" },
  })

  const data = JSON.parse(JSON.stringify(costCenters))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Cost Centers</h1>
        <Link href="/keuangan/pusat-biaya/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-cc-btn">
          + Buat Cost Center
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari kode atau nama..." action="/keuangan/pusat-biaya" />
        </div>

        <CostCenterTable data={data} />
      </div>
    </div>
  )
}
