export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VehicleFitmentForm } from "@/components/forms/vehicle-fitment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Aturan Fitment" }

export default async function CreateVehicleFitmentPage() {
  await requirePermission("create_vehicle_fitments")

  const [items, brands, models, variants] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true },
    }),
    prisma.vehicleBrand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vehicleModel.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, vehicleBrandId: true } }),
    prisma.vehicleVariant.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, vehicleModelId: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Kendaraan", href: "/kendaraan" },
        { label: "Fitment", href: "/kendaraan/fitment" },
        { label: "Tambah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Aturan Fitment</h1>
      </div>
      <VehicleFitmentForm items={items} brands={brands} models={models} variants={variants} />
    </div>
  )
}
