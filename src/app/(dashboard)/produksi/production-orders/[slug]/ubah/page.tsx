export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { ProductionOrderForm } from "@/components/forms/production-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Production Orders" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_production_orders")

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.productionOrder.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.productionOrder.findUnique({ where: { id } }),
    },
  )

  if (!data) notFound()

  const order = {
    id: data.id,
    workOrderId: 0,
    itemId: 0,
    productId: data.productId,
    qty: Number(data.qty),
    startDate: data.startDate?.toISOString().split("T")[0] ?? null,
    endDate: data.endDate?.toISOString().split("T")[0] ?? null,
    notes: data.notes,
  }

  const products = await prisma.product.findMany({ orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi/production-orders" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <ProductionOrderForm order={order} products={products}/>
    </div>
  )
}
