export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { VehicleModelForm } from "@/components/forms/vehicle-model-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.vehicleModel.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const brands = await prisma.vehicleBrand.findMany({ orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "vehicles", href: "/kendaraan/model" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <VehicleModelForm model={{ id: data.id, name: data.name, vehicleBrandId: data.vehicleBrandId ?? undefined }} brands={brands}/>
    </div>
  )
}
