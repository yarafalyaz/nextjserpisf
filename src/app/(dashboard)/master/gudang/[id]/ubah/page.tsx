export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { WarehouseForm } from "@/components/forms/warehouse-form"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Gudang" }

export default async function EditWarehousePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_warehouses")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: numId, deletedAt: null },
  })

  if (!warehouse) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Gudang", href: "/master/gudang" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Gudang: {warehouse.name}</h1>
      </div>
      <WarehouseForm warehouse={warehouse} />
    </div>
  )
}
