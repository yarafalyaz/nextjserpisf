export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { assertMaterialRequestVisible } from "@/lib/services/material-request.service"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { MaterialRequestForm } from "@/components/forms/material-request-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export const metadata: Metadata = { title: "Ubah Permintaan Antar Gudang" }

export default async function EditMaterialRequestPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("edit_material_requests")
  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.materialRequest.findFirst({
          where: { slug: s },
          include: { items: { select: { itemId: true, qty: true, notes: true } } },
        }),
      byId: (id) =>
        prisma.materialRequest.findUnique({
          where: { id },
          include: { items: { select: { itemId: true, qty: true, notes: true } } },
        }),
    },
  )

  if (!data) notFound()
  try {
    await assertMaterialRequestVisible(user, data.id)
  } catch {
    notFound()
  }
  if (data.status !== "draft") notFound()

  const [warehouses, items, workOrders] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, unitOfMeasure: true } }),
    prisma.workOrder.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, documentNo: true } }),
  ])

  const request = {
    id: data.id,
    requesterWarehouseId: data.requesterWarehouseId,
    sourceWarehouseId: data.sourceWarehouseId,
    workOrderId: data.workOrderId,
    neededBy: data.neededBy ? data.neededBy.toISOString().split("T")[0] : null,
    items: data.items.map((it) => ({ itemId: it.itemId, qty: Number(it.qty), notes: it.notes })),
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Inventaris", href: "/inventaris" },
        { label: "Permintaan Antar Gudang", href: "/inventaris/permintaan-gudang" },
        { label: "Ubah" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Permintaan Antar Gudang</h1>
      </div>
      <MaterialRequestForm warehouses={warehouses} items={items} workOrders={workOrders} request={request} />
    </div>
  )
}
