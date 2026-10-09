export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { VehicleForm } from "@/components/forms/vehicle-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Kendaraan" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_vehicles")

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.vehicle.findFirst({
          where: { slug: s },
          include: { variant: { include: { model: true } } },
        }),
      byId: (id) =>
        prisma.vehicle.findUnique({
          where: { id },
          include: { variant: { include: { model: true } } },
        }),
    },
  )

  if (!data) notFound()

  const [brands, models, variants] = await Promise.all([
    prisma.vehicleBrand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vehicleModel.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, vehicleBrandId: true } }),
    prisma.vehicleVariant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, vehicleModelId: true, drivetrain: true, transmission: true },
    }),
  ])

  const vehicle = {
    id: data.id,
    name: data.name ?? "",
    brandId: data.variant?.model?.vehicleBrandId ?? null,
    modelId: data.variant?.vehicleModelId ?? null,
    variantId: data.vehicleVariantId ?? null,
    year: data.year ?? null,
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
      <VehicleForm vehicle={vehicle} brands={brands} models={models} variants={variants} />
    </div>
  )
}
