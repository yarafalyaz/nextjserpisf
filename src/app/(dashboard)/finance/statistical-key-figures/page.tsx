export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { StatisticalKeyFigureTable } from "./_components/statistical-key-figure-table"

export default async function StatisticalKeyFiguresPage({
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

  const figures = await prisma.statisticalKeyFigure.findMany({
    where,
    orderBy: { name: "asc" },
  })

  const data = JSON.parse(JSON.stringify(figures))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Angka Kunci Statistik</h1>
        <Link href="/finance/statistical-key-figures/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-skf-btn">
          + Tambah
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama..." action="/finance/statistical-key-figures" />
        </div>

        <StatisticalKeyFigureTable data={data} />
      </div>
    </div>
  )
}
