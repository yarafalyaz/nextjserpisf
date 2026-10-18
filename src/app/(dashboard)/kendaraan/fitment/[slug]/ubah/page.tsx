export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { VehicleFitmentForm } from "@/components/forms/vehicle-fitment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Aturan Kompatibilitas" }

export default async function EditVehicleFitmentPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_vehicle_fitments")

  const { slug } = await params

  const rule = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.vehicleFitmentRule.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) =>
        prisma.vehicleFitmentRule.findFirst({ where: { id, ...where } }),
    },
  )
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
        { label: "Kompatibilitas", href: "/kendaraan/fitment" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Aturan Kompatibilitas</h1>
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
