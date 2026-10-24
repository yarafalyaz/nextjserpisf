export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { MaterialRequestForm } from "@/components/forms/material-request-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export const metadata: Metadata = { title: "Tambah Permintaan Antar Gudang" }

export default async function CreateMaterialRequestPage() {
  await requirePermission("create_material_requests")

  const [warehouses, items, workOrders] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, unitOfMeasure: true } }),
    prisma.workOrder.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, documentNo: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Inventaris", href: "/inventaris" },
        { label: "Permintaan Antar Gudang", href: "/inventaris/permintaan-gudang" },
        { label: "Tambah" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Permintaan Antar Gudang</h1>
      </div>
      <MaterialRequestForm warehouses={warehouses} items={items} workOrders={workOrders} />
    </div>
  )
}
