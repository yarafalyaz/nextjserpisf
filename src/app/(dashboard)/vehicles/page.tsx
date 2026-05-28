export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { VehicleTable } from "./_components/vehicle-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { plateNumber: { contains: params.search } },
        { color: { contains: params.search } },
        { variant: { name: { contains: params.search } } },
      ],
    }),
  }

  const vehicles = await prisma.vehicle.findMany({
    where,
    include: {
      variant: {
        include: {
          model: {
            include: { brand: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(vehicles))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Kendaraan" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Semua Kendaraan</h1>
        <Link
          href="/vehicles/create"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
        >
          + Tambah Kendaraan
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari plat nomor, warna, atau varian..." action="/vehicles" />
        </div>

        <VehicleTable data={tableData} />
      </div>
    </div>
  )
}
