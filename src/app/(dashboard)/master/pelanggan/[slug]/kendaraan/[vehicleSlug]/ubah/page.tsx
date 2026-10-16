export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerVehicleForm } from "@/components/forms/customer-vehicle-form"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Kendaraan" }

export default async function EditCustomerVehiclePage({
  params,
}: {
  params: Promise<{ slug: string; vehicleSlug: string }>
}) {
  await requirePermission("edit_customers")
  const { slug, vehicleSlug } = await params

  const customer = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.customer.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.customer.findUnique({ where: { id, ...where } }),
    },
  )

  if (!customer) notFound()

  const customerId = customer.id
  const customerKey = customer.slug ?? customer.id

  const cvInclude = {
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
  } as const

  // Slug lebih dulu; id numerik tetap diterima untuk tautan lama. Cakupannya
  // dibatasi ke pelanggan di slug induk, supaya satu unit tidak bisa dibuka
  // lewat pelanggan lain.
  const cv = await resolveEntity(
    { segment: vehicleSlug, fallbackWhere: { customerId: customer.id } },
    {
      bySlug: (s, where) => prisma.customerVehicle.findFirst({ where: { slug: s, ...where }, include: cvInclude }),
      byId: (id, where) => prisma.customerVehicle.findFirst({ where: { id, ...where }, include: cvInclude }),
    },
  )

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

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Kendaraan</h1>
      </div>

      <CustomerVehicleForm customerId={customerId} brands={brands} vehicle={existingData} />
    </div>
  )
}
