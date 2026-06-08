export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerVehicleForm } from "@/components/forms/customer-vehicle-form"

export default async function EditCustomerVehiclePage({
  params,
}: {
  params: Promise<{ id: string; vehicleId: string }>
}) {
  await requirePermission("edit_customers")
  const { id, vehicleId } = await params
  const customerId = Number(id)
  const customerVehicleId = Number(vehicleId)

  if (
    !Number.isInteger(customerId) ||
    customerId <= 0 ||
    !Number.isInteger(customerVehicleId) ||
    customerVehicleId <= 0
  ) {
    notFound()
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId, deletedAt: null },
  })

  if (!customer) notFound()

  const cv = await prisma.customerVehicle.findUnique({
    where: { id: customerVehicleId },
    include: {
      vehicle: {
        include: {
          variant: {
            include: {
              model: {
                include: { brand: true },
              },
            },
          },
        },
      },
    },
  })

  if (!cv || cv.customerId !== customerId) notFound()

  const brands = await prisma.vehicleBrand.findMany({
    orderBy: { name: "asc" },
    include: {
      models: {
        orderBy: { name: "asc" },
        include: {
          variants: { orderBy: { name: "asc" } },
        },
      },
    },
  })

  const existingData = {
    id: cv.id,
    vehicleId: cv.vehicleId,
    brandId: cv.vehicle?.variant?.model?.brand?.id || null,
    modelId: cv.vehicle?.variant?.model?.id || null,
    variantId: cv.vehicle?.variant?.id || null,
    licensePlate: cv.licensePlate || "",
    year: cv.year || null,
    color: cv.color || "",
    vehicleType: cv.vehicleType || "",
    transmission: cv.transmission || "",
    chassisNumber: cv.chassisNumber || "",
    engineNumber: cv.engineNumber || "",
    isActive: cv.isActive,
    notes: cv.notes || "",
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Pelanggan", href: "/master/pelanggan" },
        { label: customer.name, href: `/master/pelanggan/${id}` },
        { label: "Kendaraan", href: `/master/pelanggan/${id}/kendaraan` },
        { label: "Ubah" },
      ]} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Kendaraan</h1>
      </div>

      <CustomerVehicleForm customerId={customerId} brands={brands} vehicle={existingData} />
    </div>
  )
}
