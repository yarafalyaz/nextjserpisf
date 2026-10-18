export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { ShippingMethodForm } from "@/components/forms/shipping-method-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Metode Pengiriman" }

export default async function EditShippingMethodPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_shipping_methods")
  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.shippingMethod.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.shippingMethod.findUnique({ where: { id } }),
    },
  )
  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Metode Pengiriman", href: "/master/metode-pengiriman" },
        { label: "Ubah" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Metode Pengiriman</h1>
      </div>
      <ShippingMethodForm method={{ id: data.id, code: data.code, name: data.name, isActive: data.isActive }} />
    </div>
  )
}
