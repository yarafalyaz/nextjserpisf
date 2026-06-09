export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ProjectForm } from "@/components/forms/project-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Proyek" }

export default async function CreateProjectPage() {
  await requirePermission("view_projects")

  const [customers, customerVehiclesRaw, generatedCode] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.customerVehicle.findMany({
      where: { isActive: true },
      include: { vehicle: { include: { variant: { include: { model: { include: { brand: true } } } } } } },
      orderBy: { licensePlate: "asc" },
    }),
    peekNextDocumentNumber("PRJ"),
  ])

  const customerVehicles = customerVehiclesRaw.map((cv) => ({
    id: cv.id,
    licensePlate: cv.licensePlate,
    vehicleName: [cv.vehicle.variant?.model?.brand?.name, cv.vehicle.variant?.model?.name, cv.vehicle.variant?.name].filter(Boolean).join(" ") || `Vehicle #${cv.vehicleId}`,
    customerId: cv.customerId,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Proyek",href:"/proyek"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Proyek</h1>
      </div>
      <ProjectForm customers={customers} customerVehicles={customerVehicles} generatedCode={generatedCode} />
    </div>
  )
}
