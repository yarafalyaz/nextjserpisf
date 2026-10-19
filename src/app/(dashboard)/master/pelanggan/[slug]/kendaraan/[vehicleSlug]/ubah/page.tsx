export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerVehicleForm } from "@/components/forms/customer-vehicle-form"
import { loadCustomerVehicleContext } from "../../_components/load-customer-vehicle"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Kendaraan" }

export default async function EditCustomerVehiclePage({
  params,
}: {
  params: Promise<{ slug: string; vehicleSlug: string }>
}) {
  await requirePermission("edit_customers")
  const { slug, vehicleSlug } = await params

  const { customer, customerId, customerKey, cv } = await loadCustomerVehicleContext(slug, vehicleSlug)

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
    plateNumber: cv.plateNumber || "",
    year: cv.vehicle?.year || null,
    color: cv.color || "",
    chassisNumber: cv.chassisNumber || "",
    engineNumber: cv.engineNumber || "",
    isActive: cv.isActive,
    notes: cv.notes || "",
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Pelanggan", href: "/master/pelanggan" },
        { label: customer.name, href: `/master/pelanggan/${customerKey}` },
        { label: "Kendaraan", href: `/master/pelanggan/${customerKey}/kendaraan` },
        { label: "Ubah" },
      ]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Kendaraan</h1>
      </div>

      <CustomerVehicleForm customerId={customerId} brands={brands} vehicle={existingData} />
    </div>
  )
}
