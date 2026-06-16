export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { VehicleModelForm } from "@/components/forms/vehicle-model-form"
import { VehicleVariantManager } from "@/components/forms/vehicle-variant-manager"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Model Kendaraan" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_vehicles")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const data = await prisma.vehicleModel.findUnique({
    where: { id: numId },
    include: { variants: { orderBy: { name: "asc" } } },
  })

  if (!data) notFound()

  const brands = await prisma.vehicleBrand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Kendaraan", href: "/kendaraan/model" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Model Kendaraan</h1>
      </div>
      <VehicleModelForm model={{ id: data.id, name: data.name, vehicleBrandId: data.vehicleBrandId ?? undefined }} brands={brands}/>
      <VehicleVariantManager modelId={data.id} variants={data.variants.map((v) => ({ id: v.id, name: v.name, drivetrain: v.drivetrain, transmission: v.transmission }))} />
    </div>
  )
}
