export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { PositionTable } from "./_components/position-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function PositionsPage({
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

  const positions = await prisma.position.findMany({
    where,
    include: { department: true },
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(positions))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Jabatan" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Jabatan</h1>
        <Link href="/master/jabatan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-position-btn">
          + Tambah Jabatan
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama jabatan..." action="/master/jabatan" />
        </div>

        <PositionTable data={tableData} />
      </div>
    </div>
  )
}
