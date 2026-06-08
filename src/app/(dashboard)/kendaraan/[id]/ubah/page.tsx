export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { VehicleForm } from "@/components/forms/vehicle-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_vehicles")

  const { id } = await params

  const data = await prisma.vehicle.findUnique({
    where: { id: Number(id) },
    include: {
      variant: { include: { model: true } },
      customerVehicles: { take: 1 },
    },
  })

  if (!data) notFound()

  const [brands, models, variants, customers] = await Promise.all([
    prisma.vehicleBrand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vehicleModel.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, vehicleBrandId: true } }),
    prisma.vehicleVariant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, vehicleModelId: true, drivetrain: true, transmission: true },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  const vehicle = {
    id: data.id,
    plateNumber: data.plateNumber ?? "",
    plateNo: data.plateNumber ?? "",
    brandId: data.variant?.model?.vehicleBrandId ?? null,
    modelId: data.variant?.vehicleModelId ?? null,
    variantId: data.vehicleVariantId ?? null,
    year: data.year ?? null,
    color: data.color ?? null,
    customerId: data.customerVehicles[0]?.customerId ?? null,
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Kendaraan", href: "/kendaraan" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Kendaraan</h1>
      </div>
      <VehicleForm vehicle={vehicle} brands={brands} models={models} variants={variants} customers={customers} />
    </div>
  )
}
