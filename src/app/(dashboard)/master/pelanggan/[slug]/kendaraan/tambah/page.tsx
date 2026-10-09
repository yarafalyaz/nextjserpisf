export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerVehicleForm } from "@/components/forms/customer-vehicle-form"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Kendaraan" }

export default async function CreateCustomerVehiclePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("create_customers")
  const { slug } = await params

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
        { label: customer.name, href: `/master/pelanggan/${customerKey}` },
        { label: "Kendaraan", href: `/master/pelanggan/${customerKey}/kendaraan` },
        { label: "Tambah" },
      ]} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Kendaraan</h1>
      </div>

      <CustomerVehicleForm customerId={customerId} brands={brands} />
    </div>
  )
}
