export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { RackRowTable } from "./_components/rack-row-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function RackRowsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
      ],
    }),
  }

  const rackRows = await prisma.rackRow.findMany({
    where,
    include: {
      rack: {
        include: { warehouse: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(rackRows))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Inventory", href: "/inventaris" },
        { label: "Baris Rak" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Baris Rak</h1>
        <Link href="/inventaris/baris-rak/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-rack-row-btn">
          + Tambah Baris Rak
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama atau kode baris rak..." action="/inventaris/baris-rak" />
        </div>

        <RackRowTable data={tableData} />
      </div>
    </div>
  )
}
