export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VehicleForm } from "@/components/forms/vehicle-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Kendaraan" }

export default async function CreateVehiclePage() {
  await requirePermission("create_vehicles")

  const [brands, models, variants] = await Promise.all([
    prisma.vehicleBrand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vehicleModel.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, vehicleBrandId: true },
    }),
    prisma.vehicleVariant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, vehicleModelId: true, drivetrain: true, transmission: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Kendaraan",href:"/kendaraan"},{label:"Tambah"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Kendaraan</h1>
      </div>
      <VehicleForm brands={brands} models={models} variants={variants} />
    </div>
  )
}
