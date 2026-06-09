export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { RackTable } from "./_components/rack-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Rak" }

export default async function RacksPage({
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

  const racks = await prisma.rack.findMany({
    where,
    include: { warehouse: true, rows: true },
    take: 1000,
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(racks))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Inventaris", href: "/inventaris" },
  { label: "Rak" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Rak</h1>
        <Link href="/inventaris/rak/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-rack-btn">
          + Tambah Rack
        </Link>
      </div>

      <RackTable data={tableData} />
    </div>
  )
}
