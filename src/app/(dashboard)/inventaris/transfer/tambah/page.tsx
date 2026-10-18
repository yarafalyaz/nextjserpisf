export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { InventoryTransferForm } from "@/components/forms/inventory-transfer-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Transfer Stok" }

export default async function CreateTransferPage() {
  await requirePermission("create_inventory_transfers")

  const [warehouses, items] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, qtyOnHand: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Inventaris", href: "/inventaris" },
  { label: "Transfer", href: "/inventaris/transfer" },
  { label: "Tambah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Transfer Inventaris</h1>
      </div>
      <InventoryTransferForm warehouses={warehouses} items={JSON.parse(JSON.stringify(items))} />
    </div>
  )
}
