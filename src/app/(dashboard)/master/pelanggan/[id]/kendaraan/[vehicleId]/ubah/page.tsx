export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerVehicleForm } from "@/components/forms/customer-vehicle-form"

export default async function EditCustomerVehiclePage({
  params,
}: {
  params: Promise<{ id: string; kendaraanId: string }>
}) {
  await requirePermission("edit_customers")
  const { id, kendaraanId } = await params

  const customer = await prisma.customer.findUnique({
    where: { id: Number(id), deletedAt: null },
  })

  if (!customer) notFound()

  const cv = await prisma.customerVehicle.findUnique({
    where: { id: Number(kendaraanId) },
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

  if (!cv || cv.customerId !== Number(id)) notFound()

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
    kendaraanId: cv.kendaraanId,
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
        { label: "Dashboard", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Customers", href: "/master/pelanggan" },
        { label: customer.name, href: `/master/pelanggan/${id}` },
        { label: "Kendaraan", href: `/master/pelanggan/${id}/kendaraan` },
        { label: "Edit" },
      ]} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Kendaraan</h1>
      </div>

      <CustomerVehicleForm customerId={Number(id)} brands={brands} vehicle={existingData} />
    </div>
  )
}
