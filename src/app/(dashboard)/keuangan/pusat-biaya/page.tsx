export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { CostCenterTable } from "./_components/cost-center-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pusat Biaya" }

export default async function CostCentersPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_cost_centers")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

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
    take,
    skip: (page - 1) * pageSize,
    orderBy: { name: "asc" },
  })

  const data = JSON.parse(JSON.stringify(costCenters))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pusat Biaya</h1>
        <Link href="/keuangan/pusat-biaya/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-cc-btn">
          + Buat Cost Center
        </Link>
      </div>

      <CostCenterTable data={data} />
    </div>
  )
}
