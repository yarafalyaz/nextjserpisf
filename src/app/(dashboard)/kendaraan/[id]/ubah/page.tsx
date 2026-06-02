/* eslint-disable @typescript-eslint/no-explicit-any */
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
  })

  if (!data) notFound()

  const [brands, models, customers] = await Promise.all([
    prisma.vehicleBrand.findMany({ orderBy: { name: "asc" } }),
    prisma.vehicleModel.findMany({ orderBy: { name: "asc" } }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
  ])

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
      <VehicleForm vehicle={data as any} brands={brands as any} models={models as any} customers={customers as any} />
    </div>
  )
}
