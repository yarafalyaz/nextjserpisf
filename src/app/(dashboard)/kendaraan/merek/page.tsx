export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Car } from "lucide-react"
import { VehicleBrandTable } from "./_components/vehicle-brand-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function VehicleBrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_vehicles")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const brands = await prisma.vehicleBrand.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { models: true } },
    },
  })

  const tableData = JSON.parse(JSON.stringify(brands))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Kendaraan",href:"/kendaraan"},{label:"Merek"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Merek Kendaraan</h1>
        <Link href="/kendaraan/merek/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-brand-btn">
          <Car size={16} /> Tambah Merek
        </Link>
      </div>

      <VehicleBrandTable data={tableData} />
    </div>
  )
}
