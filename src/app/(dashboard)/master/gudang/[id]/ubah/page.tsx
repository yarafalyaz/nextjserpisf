export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { WarehouseForm } from "@/components/forms/warehouse-form"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditWarehousePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_warehouses")
  const { id } = await params

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: Number(id), deletedAt: null },
  })

  if (!warehouse) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Warehouses", href: "/master/gudang" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Gudang: {warehouse.name}</h1>
      </div>
      <WarehouseForm warehouse={warehouse} />
    </div>
  )
}
