export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VehicleModelForm } from "@/components/forms/vehicle-model-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Model Kendaraan" }

export default async function CreateVehicleModelPage() {
  await requirePermission("view_vehicles")

  const brands = await prisma.vehicleBrand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Kendaraan", href: "/kendaraan" },
  { label: "Model", href: "/kendaraan/model" },
  { label: "Tambah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Model Kendaraan</h1>
      </div>
      <VehicleModelForm brands={brands} />
    </div>
  )
}
