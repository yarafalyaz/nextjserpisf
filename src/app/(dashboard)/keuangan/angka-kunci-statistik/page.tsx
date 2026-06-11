export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { StatisticalKeyFigureTable } from "./_components/statistical-key-figure-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Angka Kunci Statistik" }

export default async function StatisticalKeyFiguresPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_statistical_key_figures")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const figures = await prisma.statisticalKeyFigure.findMany({
    where,
    orderBy: { name: "asc" },
    take: 1000,
  })

  const data = JSON.parse(JSON.stringify(figures))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Angka Kunci Statistik</h1>
        <Link href="/keuangan/angka-kunci-statistik/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-skf-btn">
          + Tambah
        </Link>
      </div>

      <StatisticalKeyFigureTable data={data} />
    </div>
  )
}
