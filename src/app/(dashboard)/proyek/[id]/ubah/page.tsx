export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { ProjectForm } from "@/components/forms/project-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_projects")

  const { id } = await params
  const [project, customersRaw, customerVehiclesRaw] = await Promise.all([
    prisma.project.findUnique({ where: { id: Number(id) } }),
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
  ])

  if (!project) notFound()

  // Ensure the project's currently-saved customer is in the options even if it's
  // now inactive/deleted — otherwise the Combobox can't resolve the saved value
  // and the field renders empty (and a save could wipe the association).
  let customers = customersRaw
  if (project.customerId && !customers.some((c) => c.id === project.customerId)) {
    const savedCustomer = await prisma.customer.findUnique({
      where: { id: project.customerId },
      select: { id: true, name: true },
    })
    if (savedCustomer) customers = [savedCustomer, ...customers]
  }

  let customerVehiclesRawAll = customerVehiclesRaw
  if (project.customerVehicleId && !customerVehiclesRaw.some((cv) => cv.id === project.customerVehicleId)) {
    const savedVehicle = await prisma.customerVehicle.findUnique({
      where: { id: project.customerVehicleId },
      include: { vehicle: { include: { variant: { include: { model: { include: { brand: true } } } } } } },
    })
    if (savedVehicle) customerVehiclesRawAll = [savedVehicle, ...customerVehiclesRaw]
  }

  const customerVehicles = customerVehiclesRawAll.map((cv) => ({
    id: cv.id,
    licensePlate: cv.licensePlate,
    vehicleName: [cv.vehicle.variant?.model?.brand?.name, cv.vehicle.variant?.model?.name, cv.vehicle.variant?.name].filter(Boolean).join(" ") || `Vehicle #${cv.vehicleId}`,
    customerId: cv.customerId,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Proyek",href:"/proyek"},{label:"Ubah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Proyek: {project.name}</h1>
      </div>
      <ProjectForm
        customers={customers}
        customerVehicles={customerVehicles}
        project={{
          ...project,
          startDate: project.startDate?.toISOString().split("T")[0] ?? null,
          endDate: project.endDate?.toISOString().split("T")[0] ?? null,
        }}
      />
    </div>
  )
}
