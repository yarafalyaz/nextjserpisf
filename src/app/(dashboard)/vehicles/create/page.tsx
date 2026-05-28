export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VehicleForm } from "@/components/forms/vehicle-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateVehiclePage() {
  await requirePermission("create_vehicles")

  const [brands, models, customers] = await Promise.all([
    prisma.vehicleBrand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vehicleModel.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, vehicleBrandId: true },
    }),
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Kendaraan",href:"/vehicles"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Kendaraan</h1>
      </div>
      <VehicleForm brands={brands} models={models} customers={customers} />
    </div>
  )
}
