export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { ShippingMethodForm } from "@/components/forms/shipping-method-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditShippingMethodPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_shipping_methods")
  const { id } = await params

  const data = await prisma.shippingMethod.findUnique({ where: { id: Number(id) } })
  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Metode Pengiriman", href: "/master/metode-pengiriman" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Metode Pengiriman</h1>
      </div>
      <ShippingMethodForm method={{ id: data.id, code: data.code, name: data.name, isActive: data.isActive }} />
    </div>
  )
}
