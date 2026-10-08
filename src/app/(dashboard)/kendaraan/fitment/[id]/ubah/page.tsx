export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { VehicleFitmentForm } from "@/components/forms/vehicle-fitment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Aturan Fitment" }

export default async function EditVehicleFitmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_vehicle_fitments")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const rule = await prisma.vehicleFitmentRule.findUnique({ where: { id: numId } })
  if (!rule) notFound()

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
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Aturan Fitment</h1>
      </div>
      <VehicleFitmentForm
        items={items}
        brands={brands}
        models={models}
        variants={variants}
        rule={{
          id: rule.id,
          itemId: rule.itemId,
          vehicleBrandId: rule.vehicleBrandId,
          vehicleModelId: rule.vehicleModelId,
          vehicleVariantId: rule.vehicleVariantId,
          yearFrom: rule.yearFrom,
          yearTo: rule.yearTo,
          drivetrain: rule.drivetrain,
          transmission: rule.transmission,
          result: rule.result,
          source: rule.source,
          notes: rule.notes,
          isActive: rule.isActive,
        }}
      />
    </div>
  )
}
