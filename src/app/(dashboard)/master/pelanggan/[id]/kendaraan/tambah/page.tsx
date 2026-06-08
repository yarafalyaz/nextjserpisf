export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerVehicleForm } from "@/components/forms/customer-vehicle-form"

export default async function CreateCustomerVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("create_customers")
  const { id } = await params
  const customerId = Number(id)

  if (!Number.isInteger(customerId) || customerId <= 0) notFound()

  const customer = await prisma.customer.findUnique({
    where: { id: customerId, deletedAt: null },
  })

  if (!customer) notFound()

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
        { label: "Master Data", href: "/master" },
        { label: "Pelanggan", href: "/master/pelanggan" },
        { label: customer.name, href: `/master/pelanggan/${id}` },
        { label: "Kendaraan", href: `/master/pelanggan/${id}/kendaraan` },
        { label: "Tambah" },
      ]} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Kendaraan</h1>
      </div>

      <CustomerVehicleForm customerId={customerId} brands={brands} />
    </div>
  )
}
