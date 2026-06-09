export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { VehicleBrandForm } from "@/components/forms/vehicle-brand-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Merek Kendaraan" }

export default async function EditPage({
  params,
}: Readonly<{
  params: Promise<Readonly<{ id: string }>>
}>) {
  await requirePermission("edit_vehicle_brands")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const data = await prisma.vehicleBrand.findUnique({
    where: { id: numId },
  })

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Kendaraan", href: "/kendaraan" },
          { label: "Merek", href: "/kendaraan/merek" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Merek Kendaraan</h1>
      </div>
      <VehicleBrandForm brand={{ id: data.id, name: data.name }} />
    </div>
  )
}
