export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerVehicleForm } from "@/components/forms/customer-vehicle-form"
import { loadCustomerBySlug } from "../_components/load-customer-vehicle"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Kendaraan" }

export default async function CreateCustomerVehiclePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("create_customers")
  const { slug } = await params

  const { customer, customerId, customerKey } = await loadCustomerBySlug(slug)

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

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Pelanggan", href: "/master/pelanggan" },
        { label: customer.name, href: `/master/pelanggan/${customerKey}` },
        { label: "Kendaraan", href: `/master/pelanggan/${customerKey}/kendaraan` },
        { label: "Tambah" },
      ]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Kendaraan</h1>
      </div>

      <CustomerVehicleForm customerId={customerId} brands={brands} />
    </div>
  )
}
